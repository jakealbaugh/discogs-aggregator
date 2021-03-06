require("colors");
const Aggregator = require("./Aggregator");
const Database = require("./Database");
const db = new Database();
const sse = require("./sse");
const Discogs = require("disconnect").Client;
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync("secrets.json").toString());

const {
  fuzzySearch,
  getArtist,
  getArtistGraph,
  getArtistReleases,
  getCollection,
  getCollectionReleases,
  getCollections,
  getLabel,
  getLabelReleases,
  getRelease,
  getReleaseGraph
} = require("../queries");

const am = fn => (req, res) => {
  Promise.resolve(fn(req, res)).catch(console.error);
};

class Routes {
  constructor(app) {
    this.app = app;
    this.app.use(sse);
    this.api = new Discogs(settings.discogs).database();
    this.initialize();
  }

  async initialize() {
    await this.initializeViews();
    await this.initializeApi();
  }

  async initializeViews() {
    await this.initializeViewRoot();
    await this.initializeViewServer();
    await this.initializeViewArtist();
    await this.initializeViewCollection();
    await this.initializeViewLabel();
    await this.initializeViewRelease();
  }

  async initializeApi() {
    await this.initializeApiArtistReleases();
    await this.initializeApiCollectionReleases();
    await this.initializeApiLabelReleases();
    await this.initializeApiPopulate();
    await this.initializeApiSearch();
  }

  async initializeViewRoot() {
    const callback = async (req, res) => {
      const data = { type: "browser", payload: {} };
      res.send(this.injectData(data));
    };
    this.app.get("/", am(callback));
  }

  async initializeViewServer() {
    const callback = async (req, res) => {
      const data = { type: "server" };
      const { rows } = await db.execute(getCollections());
      const allData = { collections: rows };
      data.payload = allData;
      res.send(this.injectData(data));
    };
    this.app.get("/server", am(callback));
  }

  async initializeViewArtist() {
    const callback = async (req, res) => {
      const data = { type: "artist" };
      const artist = await db.execute(getArtist(req.params.artistId));
      data.payload = { artist: artist.rows[0] };
      const graph = await db.execute(getArtistGraph(req.params.artistId));
      data.payload.artists = graph.rows;
      this.api.getArtist(req.params.artistId).then(full => {
        data.payload.full = full;
        res.send(this.injectData(data));
      });
    };
    this.app.get("/artist/:artistId", am(callback));
  }

  async initializeViewRelease() {
    const callback = async (req, res) => {
      const data = { type: "release" };
      const release = await db.execute(getRelease(req.params.releaseId));
      data.payload = { release: release.rows[0] };
      const graph = await db.execute(getReleaseGraph(req.params.releaseId));
      data.payload.releases = graph.rows;
      this.api.getRelease(req.params.releaseId).then(full => {
        data.payload.full = full;
        res.send(this.injectData(data));
      });
    };
    this.app.get("/release/:releaseId", am(callback));
  }

  async initializeViewCollection() {
    const callback = async (req, res) => {
      const data = { type: "collection", payload: {} };
      const collection = await db.execute(
        getCollection(req.params.collectionId)
      );
      data.payload.collection = collection.rows[0];
      const graph = await db.execute(
        getCollectionReleases(req.params.collectionId)
      );
      data.payload.releases = graph.rows;
      res.send(this.injectData(data));
    };
    this.app.get("/collection/:collectionId", am(callback));
  }

  async initializeViewLabel() {
    const callback = async (req, res) => {
      const data = { type: "label", payload: {} };
      const label = await db.execute(getLabel(req.params.labelId));
      data.payload.label = label.rows[0];
      const graph = await db.execute(getLabelReleases(req.params.labelId));
      data.payload.releases = graph.rows;
      res.send(this.injectData(data));
    };
    this.app.get("/label/:labelId", am(callback));
  }

  async initializeApiArtistReleases() {
    const callback = async (req, res) => {
      const releases = await db.execute(getArtistReleases(req.query.artistId));
      res.send(releases.rows);
    };
    this.app.get("/api/artist-releases", am(callback));
  }

  async initializeApiCollectionReleases() {
    const callback = async (req, res) => {
      const releases = await db.execute(
        getCollectionReleases(req.query.collectionId)
      );
      res.send(releases.rows);
    };
    this.app.get("/api/collection-releases", am(callback));
  }

  async initializeApiLabelReleases() {
    const callback = async (req, res) => {
      const releases = await db.execute(getLabelReleases(req.query.labelId));
      res.send(releases.rows);
    };
    this.app.get("/api/label-releases", am(callback));
  }

  // https://www.terlici.com/2015/12/04/realtime-node-expressjs-with-sse.html
  async initializeApiPopulate() {
    this.app.get("/api/populate", (req, res, next) => {
      const connections = [];
      const usernames = req.query.ids
        .split(",")
        .map(i => decodeURIComponent(i));
      res.sseSetup();
      const aggregator = new Aggregator(usernames, d => {
        res.sseSend({ type: "message", payload: d });
      });
      aggregator
        .run()
        .then(data => {
          connections.push(res);
          res.sseSend({ type: "complete", payload: "Complete!".green.bold });
        })
        .catch(e => res.sseSend({ type: "error", payload: e.message }));
    });
  }

  async initializeApiSearch() {
    const callback = async (req, res) => {
      const term = decodeURIComponent(req.query.term).toLowerCase();
      const type = decodeURIComponent(req.query.type).toLowerCase();
      const { rows } = await db.execute(fuzzySearch(term, type));
      res.send(rows);
    };
    this.app.get("/api/search", am(callback));
  }

  injectData(data) {
    const html = fs.readFileSync(`app/client/view.html`, "utf8");
    data = encodeURIComponent(JSON.stringify(data));
    return html.replace(
      /id="payload" value=""/,
      `id="payload" value="${data}"`
    );
  }

  errorHandler(error, res) {
    res.status = 404;
    res.send({ error });
  }
}

module.exports = Routes;
