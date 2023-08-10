const request = ({
  url,
  method='POST',
  data,
  headers={},
  onprogress,
}) => {
  return new Promise((resolve, reject) => {
    const xhr= new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    xhr.upload.onprogress = onprogress;
    xhr.send(data);
    xhr.onload = e => {
      resolve({
        data: e.target.response,
      });
    };
  });
};

export default request;