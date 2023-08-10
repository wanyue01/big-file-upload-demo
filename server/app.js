const express = require('express');
const path = require('path');
const fse = require('fs-extra');
const multiparty = require('multiparty');
const bodyParser = require('body-parser');

const app = express();
const UPLOAD_FILES_DIR = path.resolve(__dirname, './filelist');

const jsonParser = bodyParser.json({ extended: false });

// 因为这里端口不同需要配置跨域
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

// 获取已上传文件列表
const getUploadedChunkList = async (fileHash) => {
  const isExist = fse.existsSync(path.resolve(UPLOAD_FILES_DIR, fileHash));
  if (isExist) {
    return await fse.readdir(path.resolve(UPLOAD_FILES_DIR, fileHash));
  }
  return [];
};

app.post('/verifyFileIsExist', jsonParser, async (req, res) => {
  const { fileHash, suffix } = req.body;
  const filePath = path.resolve(UPLOAD_FILES_DIR, fileHash + '.' + suffix);
  if (fse.existsSync(filePath)) {
    res.send({
      code: 200,
      shouldUpload: false,
    });
    return;
  }
  const list = await getUploadedChunkList(fileHash);
  if (list.length) {
    res.send({
      code: 200,
      shouldUpload: true,
      uploadChunkList: list,
    });
    return;
  }
  res.send({
    code: 200,
    shouldUpload: true,
    uploadChunkList: [],
  });
});

app.post('/upload', async (req, res) => {
  const multipart = new multiparty.Form();
  multipart.parse(req, async (err, fields, files) => {
    if (err) return;
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const chunksDir = path.resolve(UPLOAD_FILES_DIR, hash.split('-')[0]);
    if (!fse.existsSync(chunksDir)) {
      await fse.mkdirs(chunksDir);
    }
    await fse.move(chunk.path, chunksDir + '/' + hash);
  });
  res.status(200).send('received file chunk');
});

const pipeStream = (path, writeStream) => {
  return new Promise(resolve => {
    const readStream = fse.createReadStream(path);
    readStream.on('end', () => {
      fse.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });
};

// 合并切片
const mergeFileChunk = async (filePath, fileHash, size) => {
  const chunksDir = path.resolve(UPLOAD_FILES_DIR, fileHash);
  const chunkPaths = await fse.readdir(chunksDir);
  chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1]);
  await Promise.all(
    chunkPaths.map((chunkPath, index) => {
      return pipeStream(
        path.resolve(chunksDir, chunkPath),
        // 指定位置创建可写流
        fse.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size,
        })
      );
    })
  )
  // 合并后删除切片目录
  fse.rmSync(chunksDir, {recursive: true, force: true});
};

app.post('/merge', jsonParser, async (req, res) => {
  const {fileHash, suffix, size} = req.body;
  const filePath = path.resolve(UPLOAD_FILES_DIR, fileHash + '.' + suffix);
  await mergeFileChunk(filePath, fileHash, size);
  res.send({
    code: 200,
    message: 'success',
  });
});

app.listen(3001, () => {
  console.log('server is running at http://localhost:3001');
});