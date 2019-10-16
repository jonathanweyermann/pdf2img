'use strict';

const fs = require('fs');
const path = require('path');
const pdf2img = require('pdf2img-lambda-friendly');
const aws = require('aws-sdk');
const s3 = new aws.S3({ region: 'us-west-2' });
const exec = require('await-exec')
require('events').EventEmitter.defaultMaxListeners = 100;


pdf2img.setOptions({
  type: 'png',                                // png or jpg, default jpg
  density: 150,                               // default 600
  outputdir: __dirname + path.sep + 'output', // output folder, default null (if null given, then it will create folder name same as file name)
  outputname: 'test',                         // output file name, dafault null (if null given, then it will create image name same as input name)
});

const grab_file_from_s3 = user => {
  console.log(`user: ${user}`)
  return new Promise((resolve, reject) => {
    const destPath = `/tmp/${user}.pdf`
    var params = {
      Bucket: process.env.BUCKET,
      Key: `pdfs/${user}.pdf`
    }
    console.log(`params: ${JSON.stringify(params)}`)
    const s3Stream = s3.getObject(params).createReadStream();
    console.log(`s3Stream: ${JSON.stringify(s3Stream)}`)
    const fileStream = fs.createWriteStream(destPath);
    console.log(`fileStream: ${JSON.stringify(fileStream)}`)
    s3Stream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('close', () => { resolve(destPath);});
    s3Stream.pipe(fileStream);
    console.log(`fileStream: ${JSON.stringify(s3Stream.pipe(fileStream))}`)
  });
};

const save_file_to_s3 = (path,key) => {
  console.log(`path: ${JSON.stringify(path)}`)
  fs.readFile(path, (err, data) => {
    var d = new Date();
    s3.putObject({
      Bucket: process.env.BUCKET,
      Key: `${key}`,
      ContentType: data.type,
      Body: data
    }).promise()
      .then((response) => {
        console.log(`snapshot done`, response);
      })
      .catch((err) => {
        console.error(`path error: ${path}`);
        console.error('Error', err);
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
      var path = await grab_file_from_s3(user)
      console.log(`path: ${path}`);
      console.log('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + path);
      console.log(await exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o /tmp/image%d.jpg ' + path));

      // function wait(){
      //   return new Promise((resolve, reject) => {
      //       setTimeout(() => resolve("hello"), 2000)
      //   });
      // }
      //
      // console.log(await wait());
      // console.log(await wait());
      // console.log(await wait());
      // console.log(await wait());
      // console.log(await wait());
      // console.log(await wait());

      var index = 1
      var currentUrl = `/tmp/image${index}.jpg`
      var s3Url = `${user}/image${index}.jpg`
      console.log(`currentUrl: ${currentUrl}`)
      while (fs.existsSync(currentUrl)) {
        //file exists
        save_file_to_s3(currentUrl, s3Url);
        index++;
        console.log(`s3Url: ${s3Url}`)
        console.log(`currentUrl: ${currentUrl}`)
        currentUrl = `/tmp/image${index}.jpg`
        s3Url = `${user}/image${index}.jpg`
      }
      console.log(`index: ${index}`);
      if (index > 1) {
        console.log("success, I guess")
        callback(null, 200)
        return {
          statusCode: 200,
          body: JSON.stringify(
            {
              message: 'Your function executed successfully!',
              input: event,
            },
            null,
            2
          ),
        }
      }
  } catch (err) {
      console.error(err)
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
  //});
};
