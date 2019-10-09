'use strict';

var fs      = require('fs');
var path    = require('path');
var pdf2img = require('pdf2img-lambda-friendly');
require('events').EventEmitter.defaultMaxListeners = 100;

const aws = require('aws-sdk');

const s3 = new aws.S3({ region: 'us-west-2' });

//var input   = __dirname + '/test.pdf';

pdf2img.setOptions({
  type: 'png',                                // png or jpg, default jpg
  density: 200,                               // default 600
  outputdir: __dirname + path.sep + 'output', // output folder, default null (if null given, then it will create folder name same as file name)
  outputname: 'test',                         // output file name, dafault null (if null given, then it will create image name same as input name)
});

const grab_file_from_s3 = user => {
  return new Promise((resolve, reject) => {
    s3.getObject({
      Bucket: process.env.BUCKET,
      Key: `pdfs/${user}.pdf`
    }, (err, data) => {
      if ( err ) reject(err)
           else resolve(data)
    });
  });
};



function save_file_to_s3(path, name) {
  console.log(`path: ${path}`)
  fs.readFile(path, (err, data) => {
    var d = new Date();
    s3.putObject({
      Bucket: process.env.BUCKET,
      Key: `test/${name}`,
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
  console.log(`hello: ${event['user']}`);
  const response = "";

  async () => {
    try {
      response = await grab_file_from_s3(event['user'])
    } catch (err) {
      console.error(err)
    }
  }
  console.log(`response: ${JSON.stringify(response)}`)

  pdf2img.convert(response, function(err, info) {
    console.log(response);
    if (err) console.log(err)
    else {
      console.log(`info: ${JSON.stringify(info)}`);
      for (var i = 0; i < info["message"].length; i++) {
        console.log(info["message"][i]["path"]);
        save_file_to_s3(info["message"][i]["path"], info["message"][i]["name"]);
      }
    }
  });

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event,
      },
      null,
      2
    ),
  }
};
