import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";
import request from "../utils/request";
import hashWorker from "../utils/hashWorker";
import WorkerBuilder from "../utils/workerBuild";

const CHUNK_SIZE = 1 * 1024 * 1024;

const Upload = () => {
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [chunkList, setChunkList] = useState([]);
  const [hashPercentage, setHashPercentage] = useState(0);

  // 获取文件后缀名
  const getFileSuffix = useCallback((fileName) => {
    const splitName = fileName.split(".");
    return splitName.length ? splitName[splitName.length - 1] : "";
  }, []);

  // 分割文件
  const splitFile = useCallback((file, size = CHUNK_SIZE) => {
    const fileChunkList = [];
    let currChunkIndex = 0;
    while (currChunkIndex <= file.size) {
      const chunk = file.slice(currChunkIndex, currChunkIndex + size);
      fileChunkList.push({ chunk });
      currChunkIndex += size;
    }
    return fileChunkList;
  }, []);

  // 选择文件
  const handleFileChange = useCallback(
    (e) => {
      const { files } = e.target;
      if (files.length === 0) return;
      setFileName(files[0].name);
      const chunkList = splitFile(files[0]);
      setChunkList(chunkList);
    },
    [splitFile]
  );

  // 发送合并请求
  const mergeRequest = useCallback(
    (hash) => {
      request({
        url: "http://localhost:3001/merge",
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        data: JSON.stringify({
          // 服务端存储的文件名: `${hash}.${suffix}`
          fileHash: hash,
          suffix: getFileSuffix(fileName),
          // 用于合并
          size: CHUNK_SIZE,
        }),
      });
    },
    [getFileSuffix, fileName]
  );

  // 上传分片
  const uploadChunks = useCallback(
    async (chunksData, hash) => {
      const formDataList = chunksData.map(({ chunk, hash }) => {
        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("hash", hash);
        formData.append("suffix", getFileSuffix(fileName));
        return { formData };
      });
      const requestList = formDataList.map(({ formData }, index) => {
        return request({
          url: "http://localhost:3001/upload",
          data: formData,
          onprogress: (e) => {
            const list = [...chunksData];
            list[index].progress = parseInt((e.loaded / e.total) * 100);
            setChunkList(list);
          },
        });
      });
      // 通知服务器上传完成
      Promise.all(requestList).then(() => {
        mergeRequest(hash);
      });
    },
    [fileName, getFileSuffix, mergeRequest]
  );

  // 计算文件hash
  const getHash = useCallback((chunkList) => {
    return new Promise((resolve, reject) => {
      const worker = new WorkerBuilder(hashWorker);
      worker.postMessage({ chunkList });
      worker.onmessage = (e) => {
        const { percentage, hash } = e.data;
        setHashPercentage(percentage);
        console.log(e.data, e)
        if (hash) {
          resolve(hash);
        }
      };
    });
  }, []);

  // 秒传：验证文件在服务器中是否存在
  const verifyFileIsExist = useCallback(async (fileHash, suffix) => {
    const { data } = await request({
      url: "http://localhost:3001/verifyFileIsExist",
      headers: {
        "content-type": "application/json",
      },
      data: JSON.stringify({
        fileHash,
        suffix,
      }),
    });
    return JSON.parse(data);
  }, []);

  // 上传文件总流程
  const handleUpload = useCallback(
    async (e) => {
      if (!fileName) {
        alert("请先选择文件");
        return;
      }
      if (chunkList.length === 0) {
        alert("文件拆分中，请稍后...");
        return;
      }
      const hash = await getHash(chunkList);
      setFileHash(hash);
      const { shouldUpload, uploadChunkList } = await verifyFileIsExist(
        hash,
        getFileSuffix(fileName)
      );
      if (!shouldUpload) {
        alert("文件已存在，无需上传");
        return;
      }
      let uploadChunkIndexList = [];
      if (uploadChunkList && uploadChunkList.length) {
        uploadChunkIndexList = uploadChunkList.map((item) => {
          const arr = item.split("-");
          return parseInt(arr[arr.length - 1]);
        });
        alert(`已上传的区块号：${uploadChunkIndexList.toString()}`);
      }
      const chunksData = chunkList
        .map(({ chunk }, index) => ({
          chunk,
          hash: `${hash}-${index}`,
          progress: 0,
        }))
        .filter((item) => {
          const arr = item.hash.split("-");
          return (
            uploadChunkIndexList.indexOf(parseInt(arr[arr.length - 1])) === -1
          );
        });
      setChunkList(chunksData);
      uploadChunks(chunksData, hash);
    },
    [
      fileName,
      chunkList,
      getFileSuffix,
      getHash,
      uploadChunks,
      verifyFileIsExist,
    ]
  );

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <br />
      <button onClick={handleUpload}>上传</button>
      <ProgressBox chunkList={chunkList} />
    </div>
  );
};

const BlockWraper = styled.div`
  width: ${({ size }) => size + "px"};
  height: ${({ size }) => size + "px"};
  text-align: center;
  font-size: 12px;
  line-height: ${({ size }) => size + "px"};
  border: 1px solid #ccc;
  position: relative;
  float: left;
  &:before {
    content: "${({ chunkindex }) => chunkindex}";
    position: absolute;
    width: 100%;
    height: 10px;
    left: 0;
    top: 0;
    font-size: 12px;
    text-align: left;
    line-height: initial;
    color: #000;
  }
  &:after {
    content: "";
    position: absolute;
    width: 100%;
    height: ${({ progress }) => progress + "%"};
    background-color: pink;
    left: 0;
    top: 0;
    z-index: -1;
  }
`;

const ChunksProgress = styled.div`
  *zoom: 1;
  &:after {
    content: "";
    display: block;
    clear: both;
  }
`;

const Label = styled.h3``;
const ProgressWraper = styled.div``;
const Block = ({ progress, size, chunkindex }) => {
  return (
    <BlockWraper size={size} chunkindex={chunkindex} progress={progress}>
      {progress}%
    </BlockWraper>
  );
};

const ProgressBox = ({ chunkList = [], size = 40 }) => {
  const sumProgress = useMemo(() => {
    if (chunkList.length === 0) return 0;
    return (
      (chunkList.reduce((pre, curr) => pre + curr.progress / 100, 0) * 100) /
      chunkList.length
    );
  }, [chunkList]);

  return (
    <ProgressWraper>
      <Label>文件切分为{chunkList.length}段，每段上传进度如下：</Label>
      <ChunksProgress>
        {chunkList.map(({ progress }, index) => (
          <Block
            key={index}
            size={size}
            chunkindex={index}
            progress={progress}
          />
        ))}
      </ChunksProgress>
      <Label>总进度:{sumProgress.toFixed(2)}%</Label>
    </ProgressWraper>
  );
};

export default Upload;
