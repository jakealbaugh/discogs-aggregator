const Aggregator = require("./components/Aggregator");
const fs = require("fs");
// ppl with the st vincent. https://www.discogs.com/release/stats/11256980#collection
// ppl with the breaking atoms. https://www.discogs.com/release/stats/9816263#collection
// ppl with the sumney lamentations. https://www.discogs.com/release/stats/9552940#collection
const USERNAMES = JSON.parse(fs.readFileSync("usernames.json").toString());
// const USERNAMES = ["jakealbaugh"];

const aggregator = new Aggregator(USERNAMES);
aggregator
  .run()
  .then(console.log)
  .catch(e => {
    console.error(e);
    process.exit(0);
  });
