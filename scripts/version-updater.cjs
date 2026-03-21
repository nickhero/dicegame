// Custom updater for commit-and-tag-version to handle src/version.ts
module.exports.readVersion = function (contents) {
  const match = contents.match(/VERSION = '(\d+\.\d+\.\d+)'/);
  return match ? match[1] : '0.0.0';
};

module.exports.writeVersion = function (contents, version) {
  return `export const VERSION = '${version}';\n`;
};
