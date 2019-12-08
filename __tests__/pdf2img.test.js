//import AWS from 'aws-sdk-mock';
const AWSMock = require('aws-sdk-mock');



process.env.BUCKET = "test-bucket"
const AWS = require('aws-sdk');
AWSMock.setSDKInstance(AWS);
const pdf2img = require('../pdf2img');

describe('grab the named pdf from s3', () => {
  beforeAll(() => {
    AWSMock.mock('S3', 'getObject', Buffer.from(require("fs").readFileSync("__fixtures__/test.pdf")));
    AWSMock.mock('S3', 'headObject', "Valid head data");
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('returns the locally saved image url', async () => {
    return pdf2img.grabPdfFromS3("test.pdf").then(data => expect(data).toEqual("/tmp/test.pdf"));
  },21000);
});

describe('save an image to s3', () => {
  beforeAll(() => {
    AWSMock.mock('S3', 'putObject', { Body: "successfully put file in s3" });
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('returns success', async () => {
    return pdf2img.saveFileToS3("__fixtures__/test.pdf","/tests/test.pdf").then(data => expect(data)
      .toEqual("success: saved __fixtures__/test.pdf to S3:/tests/test.pdf"))
  },1000);
});

describe('execute main handler - grab pdf from s3 and save as bunch of images', () => {
  beforeAll(() => {
    AWSMock.mock('S3', 'getObject', Buffer.from(require("fs").readFileSync("__fixtures__/test.pdf")));
    AWSMock.mock('S3', 'putObject', { Body: "successfully put file in s3" });
    AWSMock.mock('S3', 'headObject', "Valid head data");
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('returns success', async () => {
    return pdf2img.execute({"Records":[{"s3": { "object": { "key":"pdfs/test.pdf"}}}]}).then(data => expect(JSON.parse(data["body"])['input'])
      .toEqual("40 images were uploaded"))
  },60000);
});


describe('getObject with error - can not retrieve s3 file', () => {
  beforeAll(() => {
    AWSMock.mock("S3", "putObject", (params, callback) => {
        callback(true, null);
    });
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('throws an error', async () => {
    await expect(pdf2img.grabPdfFromS3("test.pdf")).rejects.toBeTruthy();
  },21000);
});

describe('putObject with error - can not save s3 file', () => {
  beforeAll(() => {
    //AWSMock.mock('S3', 'getObject', );
    AWSMock.mock('S3', 'headObject', "Valid head data");
    AWSMock.mock("S3", "getObject", (params, callback) => {
        callback(true, null);
    });
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('throws an error', async () => {
    await expect(pdf2img.saveFileToS3("__fixtures__/test.pdf","/tests/test.pdf")).rejects.toBeTruthy();
  },21000);
});

describe('execute main handler - file for some other reason does not exist', () => {
  beforeAll(() => {
    AWSMock.mock('S3', 'getObject', "valid but not useful");
    AWSMock.mock('S3', 'putObject', { Body: "successfully put file in s3" });
    AWSMock.mock('S3', 'headObject', "Valid head data");
  });

  afterAll(() => {
    AWSMock.restore('S3');
  });

  it('it fails even though we have s3 success', async () => {
    return pdf2img.execute({"Records":[{"s3": { "object": { "key":"pdfs/Test.pdf"}}}]}).then(data => expect(JSON.parse(data["body"])['message']['stderr'])
      .toContain("GPL Ghostscript 9.20: Unrecoverable error, exit code 1"));
  },60000);
});
