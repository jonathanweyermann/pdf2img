Based on pdf2img-lambda-friendly - https://www.npmjs.com/package/pdf2img-lambda-friendly

Need to add lambda-ghostscript under lambda-ghostscript/ folder

To invoke locally

```
serverless invoke local --function pdf2img --data '{"Records":[{"s3": { "object": { "key":"pdfs/{user}.pdf"}}}]}'
```
