'use strict';

const fs = require('fs');
const path = require('path');
const pdf2img = require('pdf2img-lambda-friendly');
const aws = require('aws-sdk');
const s3 = new aws.S3({ region: 'us-west-2' });
const { exec } = require('child_process')
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
    const s3Stream = s3.getObject(params).createReadStream();
    const fileStream = fs.createWriteStream(destPath);
    s3Stream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('close', () => { resolve(destPath);});
    s3Stream.pipe(fileStream);
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
        console.error(`path: ${path}`);
        console.error('Error', err);
      });
  });
};

module.exports.execute = async (event, context, callback) => {
  event['Records'].forEach(async (record) => {
    console.log(record);
    const key = record.s3.object.key;
    console.log(key);
    const split = key.split('/')
    console.log(split);
    const user = split[split.length-1].split('.')[0]
    console.log(`New .pdf object has been created: ${user}`);

    try {
        var path = await grab_file_from_s3(user)
        console.log(`path:" + ${path}`);
        console.log(exec('./lambda-ghostscript/bin/gs -sDEVICE=jpeg -dTextAlphaBits=4 -r128 -o ' + "/" + user + '/image%d.jpg ' + path));

        var index = 1
        var putkey = `/${user}/image${index}.jpg`
        while (fs.existsSync(putkey)) {
          //file exists
          index++;
          putkey = `/${user}/image${index}.jpg`
          save_file_to_s3(path, putkey);
        }

        // pdf2img.convert(response, function(err, info) {
        //   console.log(response);
        //   if (err) console.log(err)
        //   else {
        //     console.log(`info: ${JSON.stringify(info)}`);
        //     for (var i = 0; i < info["message"].length; i++) {
        //       console.log(`imp: ${info["message"][i]["path"]}`);
        //       save_file_to_s3(info["message"][i]["path"], info["message"][i]["name"], user);
        //     }
        //   }
        // });
    } catch (err) {
        console.error(err)
    }

  });

  function wait(){
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve("hello"), 500)
    });
  }

  console.log(await wait());
  console.log(await wait());
  console.log(await wait());
  console.log(await wait());
  console.log(await wait());
  console.log(await wait());

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
};
