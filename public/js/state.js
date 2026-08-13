export const PAGE_SIZE = 15;

export const state = {
  page: 1,
  totalPages: 1,
  status: "all",
  platform: "all",
  range: "all",
  date: "",
  hourFrom: "",
  hourTo: "",
  product: "",
  q: "",
  historyReq: 0,
  refreshTimer: null,
  searchTimer: null,
  productListKey: "",
  recentFailures: [],
  platforms: {
    mercadolibre: { enabled: false },
    facebook: { enabled: true },
  },
};

export const els = {};

export function bindEls() {
  Object.assign(els, {
    conn: document.getElementById("connectionStatus"),
    clearDbBtn: document.getElementById("clearDbBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    tbody: document.getElementById("statusContainer"),
    empty: document.getElementById("historyEmpty"),
    pageInfo: document.getElementById("pageInfo"),
    prev: document.getElementById("prevPage"),
    next: document.getElementById("nextPage"),
    productFilter: document.getElementById("productFilter"),
    searchFilter: document.getElementById("searchFilter"),
    dateFilter: document.getElementById("dateFilter"),
    hourFromFilter: document.getElementById("hourFromFilter"),
    hourToFilter: document.getElementById("hourToFilter"),
    statTotal: document.getElementById("statTotal"),
    statOk: document.getElementById("statOk"),
    statFail: document.getElementById("statFail"),
    statRate: document.getElementById("statRate"),
    statMl: document.getElementById("statMl"),
    metricMl: document.getElementById("metricMl"),
    filterPlatformMl: document.getElementById("filterPlatformMl"),
    statFb: document.getElementById("statFb"),
    failList: document.getElementById("failList"),
    lastFailMeta: document.getElementById("lastFailMeta"),
    copyFailsBtn: document.getElementById("copyFailsBtn"),
    productStats: document.getElementById("productStats"),
    timelineChart: document.getElementById("timelineChart"),
    timelineEmpty: document.getElementById("timelineEmpty"),
    timelineTitle: document.getElementById("timelineTitle"),
    ratioChart: document.getElementById("ratioChart"),
  });
}

export function isMlEnabled() {
  return Boolean(state.platforms?.mercadolibre?.enabled);
}
