#!/usr/bin/env node


'use strict';


const selenium = require('selenium-standalone');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackConfig = require(process.env.WEBPACK_CONFIG ?
  path.resolve(process.env.WEBPACK_CONFIG) : path.resolve(process.cwd(), 'webpack.config.js'));
const logDir = process.env.LOG_DIR ?
  path.resolve(process.env.LOG_DIR) : path.resolve(process.cwd(), 'reports');
const reportDir = process.env.REPORT_DIR ?
  path.resolve(process.env.REPORT_DIR) : path.resolve(process.cwd(), 'reports', 'test-e2e');
let nightwatchConfig = process.env.NIGHTWATCH_CONFIG ?
  path.resolve(process.env.NIGHTWATCH_CONFIG) : path.resolve(process.cwd(), 'nightwatch.json');


mkdirp.sync(reportDir);


try {
  require(nightwatchConfig);
} catch (err) {
  console.log('Fallback to default nightwatch.json config');
  nightwatchConfig = path.resolve(__dirname, 'nightwatch.json');
}


const seleniumLog = fs.createWriteStream(path.resolve(logDir, 'selenium.log'));
const which = require('npm-which')(__dirname);
const nightwatchRunner = which.sync('nightwatch');


function startServer(cb) {
  const server = new WebpackDevServer(webpack(webpackConfig), {quiet: true});

  server.listen(process.env.PORT || 8080, '0.0.0.0', cb);
}


function onServerStarted(seleniumChild) {
  return err => {
    if (err) {
      console.error(err.stack);
      process.exit(1);
    }

    cp.fork(nightwatchRunner,
      [
        '--config', nightwatchConfig,
        '--output', reportDir
      ])
      .on('error', err2 => {
        console.error(err2.stack);
        process.exit(1);
      })
      .on('close', code => {
        seleniumChild.kill('SIGINT');
        process.exit(code);
      });
  };
}


function onSeleniumStarted(err, seleniumChild) {
  if (err) {
    console.error(err.stack);
    process.exit(1);
  }
  seleniumChild.stdout.pipe(seleniumLog);
  seleniumChild.stderr.pipe(seleniumLog);

  process.on('uncaughtException', err2 => {
    console.error(err2.stack);
    seleniumChild.kill('SIGINT');
    process.exit(1);
  });

  startServer(onServerStarted(seleniumChild));
}


function onSeleniumInstalled(err) {
  if (err) {
    console.error(err.stack);
    process.exit(1);
  }

  selenium.start({seleniumArgs: ['-debug']}, onSeleniumStarted);
}


selenium.install({}, onSeleniumInstalled);
