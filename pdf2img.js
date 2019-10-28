'use strict';

const fs = require('fs');
const archiver = require('archiver-promise');
const path = require('path');
const AWS = require('aws-sdk');
const exec = require('await-exec')
const stream = require('stream')
require('events').EventEmitter.defaultMaxListeners = 100;

const grabPdfFromS3 = user => {
  const S3 = new AWS.S3({ region: 'us-west-2' });
  return new Promise((resolve, reject) => {
    const destPath = `/tmp/${user}.pdf`
    var params = {
      Bucket: process.env.BUCKET,
      Key: `pdfs/${user}.pdf`
    }
    S3.headObject(params)
      .promise()
      .then(() => {
        const s3Stream = S3.getObject(params).createReadStream()
        const fileStream = fs.createWriteStream(destPath);
        s3Stream.on('error', reject);
        fileStream.on('error', reject);
        fileStream.on('close', () => { resolve(destPath);});
        s3Stream.pipe(fileStream);
      })
      .catch(error => {
        console.log(`grabfroms3error: ${error}`);
        reject(error)
      });
  });
};

const saveFileToS3 = (path,key) => {
  const S3 = new AWS.S3({ region: 'us-west-2' });
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      S3.putObject({
        Bucket: process.env.BUCKET,
        Key: `${key}`,
        ContentType: data.type,
        Body: data
      }, (error) => {
        if (error) {
          console.log(`savetos3error: ${error}`);
         reject(`savetos3error: ${path}`);
        } else {
         resolve(`success: saved ${path} to S3:${key}`);
        }
      });
    });
  });
};

const currentUrl = (index) => {
  return `/tmp/image${index}.jpg`
}
const s3Url = (user, index) => {
  return `${user}/image${index}.jpg`
}

const user = (event) => {
  const key = event['Records'][0].s3.object.key;
  const split = key.split('/')
  return split[split.length-1].split('.')[0]
}

const createZipFile = async (index, subdir) => {
  return new Promise((resolve, reject) => {
    const s3 = new AWS.S3({ region: 'us-west-2' });
    //var output = file_system.createWriteStream(`${subdir}.zip`);
    var archive = archiver('/tmp/tmp.zip');
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        // log warning
        console.log(`err: ${err}`)
      } else {
        // throw error
        console.log(`err: ${err}`)
        throw err;
      }
    });

    // good practice to catch this error explicitly
    archive.on('error', function(err) {
      console.log(`err: ${err}`)
      throw err;
    });

    archive.pipe(uploadFromStream(s3, subdir));

    archive.glob('*.jpg',{ cwd: '/tmp'},{ prefix: '' });
    //archive.directory(`/tmp/`, false);

    archive.finalize().then( function (result) {
      console.log(`result: ${result}`)
      console.log("finalizing archive");
    });

  });
}

const uploadFromStream = (s3, subdir) => {
  var pass = new stream.PassThrough();
  console.log(`subdir: ${subdir}`)
  var params = {Bucket: process.env.BUCKET, Key: `${subdir}.zip`, Body: pass}
  s3uploadfunc(s3, params)


  console.log(`do we get here?`)

  //deleteTempFiles()
  // s3.upload(params), (err, data) => {
  //   console.log(`s3ZipUpload err: ${err}, data: ${JSON.stringify(data)}`);
  //   deleteTempFiles()
  // });

  return pass;
}

// const s3uploadfunc = async (s3, params) => {
//   await s3.upload(params, (err, data) => {
//     console.log(`s3ZipUpload err: ${err}, data: ${JSON.stringify(data)}`);
//     deleteTempFiles()
//   });
// }
const s3uploadfunc = async (s3, params) => {
  try {
    var data = await s3.upload(params).promise()
    console.log(`s3ZipUpload data: ${JSON.stringify(data)}`);
    deleteTempFiles()
  } catch (err){
    console.log(`s3ZipUpload err: ${err}`);
  }
}


const deleteTempFiles = () => {
  var files_to_delete = []
  fs.readdirSync('/tmp/').forEach(file => {
    if (file.split('.')[1]=='jpg') {
      files_to_delete.push(`/tmp/${file}`)
    }
  });

  console.log("deleting objects")
  var i = files_to_delete.length;
  files_to_delete.forEach(function(filepath){
    fs.unlinkSync(filepath);
  });
}

module.exports.execute = async (event, context, callback) => {
  try {
      var local_pdf_path = await grabPdfFromS3(user(event))
      await exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + local_pdf_path);

      var index = 1
      console.log("Finished with Ghostscript")
      while (fs.existsSync(currentUrl(index))) {
        var response = await saveFileToS3(currentUrl(index), s3Url(user(event), index));
        index++;
      }
      if (index > 1) {
        console.log(`creating zip: index ${index}, user(event): ${user(event)}`)
        await createZipFile(index,user(event));
        console.log(`supposed to be done now`)
        return { statusCode: 200, body: JSON.stringify({message: 'Success', input: `${index} images were uploaded`}, null, 2)}
      }
  } catch (err) {
    console.log(`conversion error: ${err}`);
    return { statusCode: 500, body: JSON.stringify({message: err,input: event}, null, 2)}
  }
};

module.exports.grabPdfFromS3 = grabPdfFromS3;
module.exports.saveFileToS3 = saveFileToS3;
