'use strict';

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const exec = require('await-exec')
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
         reject(`path error: ${path}`);
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

module.exports.execute = async (event, context, callback) => {
  try {
      var local_pdf_path = await grabPdfFromS3(user(event))
      await exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + local_pdf_path);

      var index = 1
      while (fs.existsSync(currentUrl(index))) {
        var response = await saveFileToS3(currentUrl(index), s3Url(user(event), index));
        index++;
      }
      if (index > 1) {
        return { statusCode: 200, body: JSON.stringify({message: 'Success', input: `${index} images were uploaded`}, null, 2)}
      }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({message: err,input: event}, null, 2)}
  }
};

module.exports.grabPdfFromS3 = grabPdfFromS3;
module.exports.saveFileToS3 = saveFileToS3;
