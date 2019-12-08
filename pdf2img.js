'use strict';

const fs = require('fs');
const archiver = require('archiver-promise');
const path = require('path');
const AWS = require('aws-sdk');
const exec = require('await-exec')
const stream = require('stream')
require('events').EventEmitter.defaultMaxListeners = 100;

const grabPdfFromS3 = fileName => {
  const S3 = new AWS.S3({ region: 'us-west-2' });
  return new Promise((resolve, reject) => {
    const destPath = `/tmp/${fileName}`
    var params = {
      Bucket: process.env.BUCKET,
      Key: `pdfs/${fileName}`
    }
    console.log(params)
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
const s3Url = (baseFileName, index) => {
  return `${baseFileName}/image${index}.jpg`
}

const baseFileName = (event) => {
  return pdfFileName(event).split('.')[0]
}

const pdfFileName = (event) => {
  const key = event['Records'][0].s3.object.key;
  const split = key.split('/')
  return split[split.length-1]
}

const createZipFile = async (index, subdir) => {
  return new Promise((resolve, reject) => {
    const s3 = new AWS.S3({ region: 'us-west-2' });
    var archive = archiver('/tmp/tmp.zip');
    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      console.log(`err: ${err}`)
      if (err.code !== 'ENOENT') {
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

  return pass;
}

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
      var local_pdf_path = await grabPdfFromS3(pdfFileName(event))
      await exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + local_pdf_path);

      var index = 1
      console.log("Finished with Ghostscript")
      while (fs.existsSync(currentUrl(index))) {
        var response = await saveFileToS3(currentUrl(index), s3Url(baseFileName(event), index));
        index++;
      }
      if (index > 1) {
        console.log(`creating zip: index ${index}, baseFileName(event): ${baseFileName(event)}`)
        await createZipFile(index,baseFileName(event));
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
