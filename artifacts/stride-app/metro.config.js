const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer = config.transformer || {};
config.transformer.publicPath = "/app/";

module.exports = config;
