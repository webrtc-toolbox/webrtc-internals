export function getParameter(key) {
  return _PARAMS[key];
}

export function setParameter(key, value) {
  _PARAMS[key] = value;
}

const _PARAMS = {
  // 实时图像， 关闭可以减少一定性能占用
  open_graph: true,
  // 更新数据间隔， 间隔越大，损耗越小
  stats_update_interval: 1000,
  // container
  container: null,
};

window.RTC_INTERNALS_PARAMS = _PARAMS;
