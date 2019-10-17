'use strict';

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

const exec = require('await-exec')
require('events').EventEmitter.defaultMaxListeners = 100;

const grabPdfFromS3 = user => {
  const S3 = new AWS.S3({ region: 'us-west-2' });
  console.log(`user: ${user}`)
  return new Promise((resolve, reject) => {
    const destPath = `/tmp/${user}.pdf`
    var params = {
      Bucket: process.env.BUCKET,
      Key: `pdfs/${user}.pdf`
    }
    console.log(`params: ${JSON.stringify(params)}`)
    S3.headObject(params)
      .promise()
      .then(() => {
        const s3Stream = S3.getObject(params).createReadStream()
        console.log(`s3Stream: ${JSON.stringify(s3Stream)}`)
        const fileStream = fs.createWriteStream(destPath);
        console.log(`fileStream: ${JSON.stringify(fileStream)}`)
        s3Stream.on('error', reject);
        fileStream.on('error', reject);
        fileStream.on('close', () => { resolve(destPath);});
        s3Stream.pipe(fileStream);
        console.log(`fileStream: ${JSON.stringify(s3Stream.pipe(fileStream))}`)
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

module.exports.execute = async (event, context, callback) => {
  //return new Promise((resolve, reject) => {
  var record = event['Records'][0]
  //event['Records'].forEach(async (record) => {
  console.log(record);
  const key = record.s3.object.key;
  console.log(key);
  const split = key.split('/')
  console.log(split);
  const user = split[split.length-1].split('.')[0]
  console.log(`New .pdf object has been created: ${user}`);

  try {
      var path = await grabPdfFromS3(user)
      console.log(`path: ${path}`);
      console.log('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + path);
      await exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + path);

      var index = 1
      var currentUrl = `/tmp/image${index}.jpg`
      var s3Url = `${user}/image${index}.jpg`
      console.log(`currentUrl: ${currentUrl}`)
      while (fs.existsSync(currentUrl)) {
        //file exists
        var response = await saveFileToS3(currentUrl, s3Url);
        index++;
        console.log(`response: ${response}`)
        console.log(`s3Url: ${s3Url}`)
        console.log(`currentUrl: ${currentUrl}`)
        currentUrl = `/tmp/image${index}.jpg`
        s3Url = `${user}/image${index}.jpg`
      }
      console.log(`index: ${index}`);
      if (index > 1) {
        console.log("success, I guess")
        //callback(null, 200)
        return {
          statusCode: 200,
          body: JSON.stringify(
            {
              message: 'Your function executed successfully!',
              input: `${index} images were uploaded`,
            },
            null,
            2
          ),
        }
      }
  } catch (err) {
      console.log(err)
      return {
        statusCode: 500,
        body: JSON.stringify(
          {
            message: err,
            input: event,
          },
          null,
          2
        ),
      }
  }
};

module.exports.grabPdfFromS3 = grabPdfFromS3;
module.exports.saveFileToS3 = saveFileToS3;
