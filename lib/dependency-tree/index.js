'use strict';

const getDeps = require('./getDeps');
const path = require('path');
const fs = require('fs');
const cabinet = require('filing-cabinet');
const debug = require('debug')('tree');
const direct = require('debug')('direct');
const Config = require('./Config');

/**
 * Recursively find all dependencies (avoiding circular) traversing the entire dependency tree
 * and returns a flat list of all unique, visited nodes
 *
 * @param {Object} options
 * @param {String} options.filename - The path of the module whose tree to traverse
 * @param {String} options.directory - The directory containing all JS files
 * @param {String} [options.requireConfig] - The path to a requirejs config
 * @param {String} [options.webpackConfig] - The path to a webpack config
 * @param {String} [options.nodeModulesConfig] - config for resolving entry file for node_modules
 * @param {Object} [options.visited] - Cache of visited, absolutely pathed files that should not be reprocessed.
 *                             Format is a filename -> tree as list lookup table
 * @param {Array} [options.nonExistent] - List of partials that do not exist
 * @param {Boolean} [options.isListForm=false]
 * @return {Object}
 */
function DepMap(options) {
    this.config = new Config(options);

    if (!fs.existsSync(this.config.filename)) {
        // 自定义console.log()模块
        debug('file ' + this.config.filename + ' does not exist');
        return this.config.isListForm ? [] : {};
    }
    this.depMap = {}
    this.depHell = {
        long: [],
        indirect: [],
        direct: []
    }
    this.lenDis={}
    this.traverse(this.config, []);
    // debug('traversal complete', JSON.stringify(this.depMap, null, 2));
    // debug('depHell', JSON.stringify(this.depHell, null, 2));
    // debug()

    // dedupeNonExistent(this.config.nonExistent);
    // debug('final tree', this.depMap);
    return {
        depMap: this.depMap,
        depHell: this.depHell,
        lenDis:this.lenDis
    };
}

DepMap.prototype = {
    traverse(config, path) {
        debug('traversing ' + config.filename);
        config.visited[config.filename] = true
        path.push(config.filename)
        // console.log('here')
        if (!this.depMap[config.filename]) {
            this.depMap[config.filename]=_getDependencies(config)
            if(config.filename==='platforms/weex/runtime/index.js'){
                // console.log(this.depMap[config.filename])
            }
        }
        const dependencies=this.depMap[config.filename]
        // debug('cabinet-resolved all dependencies: ', JSON.stringify(dependencies));
        // debug('cabinet-resolved all dependencies: ', dependencies);
        debug('cabinet-resolved all dependencies:');

        // 识别长依赖
        if (dependencies.length === 0) {
            let len=path.length
            if(this.lenDis[len]===undefined) this.lenDis[len]=0
            this.lenDis[len]++
            if(path.length >= config.lenThreshold)  this.depHell.long.push(path.slice())
        }
        for (let i = 0, l = dependencies.length; i < l; i++) {
            const d = dependencies[i];
            if (config.visited[d.src]) {
                let circlePath = path.slice(path.indexOf(d.src))
                // 间接依赖
                if (circlePath.length > 2 && !circleExist(this.depHell.indirect, circlePath))
                    this.depHell.indirect.push(circlePath)
                // 直接依赖
                else if (circlePath.length === 2 && !circleExist(this.depHell.direct, circlePath)){
                    direct(path,d.src)
                    this.depHell.direct.push(circlePath)
                }
                continue
            }
            const localConfig = config.clone();
            localConfig.filename = d.src;
            this.traverse(localConfig, path)

        }
        config.visited[config.filename] = false
        path.pop()
    }
}

// 判断是否有环
function circleExist(circles, circle) {
    let cur, firstIdx = -1
    for (let i = 0, len = circles.length; i < len; i++) {
        cur = circles[i]
        firstIdx = circle.indexOf(cur[0])
        if (circle.slice(firstIdx).concat(circle.slice(0, firstIdx)).join('|') === cur.join('|'))
            return true
    }
    return false
}

/**
 * Returns the list of dependencies for the given filename
 *
 * Protected for testing
 *
 * @param  {Config} config
 * @return {Array}
 */
function _getDependencies(config) {
    let dependencies;
    try {
        // getDeps()函数用于解析AST树
        dependencies = getDeps(config.filename);
        // console.log(config.filename,.length)
        // debug('extracted ' + dependencies.length + ' dependencies: ', dependencies);
        debug('extracted ' + dependencies.length);

    } catch (e) {
        // console.log('error getting dependencies: ' + e.message);
        debug('error getting dependencies: ' + e.message);
        debug(e.stack);
        return [];
    }
    // const resolvedDependencies = [];

    for (let i = 0, l = dependencies.length; i < l; i++) {
        const dep = dependencies[i].src;
        
        // 绝对路径
        const result = cabinet({
            partial: dep,
            filename: config.filename,
            directory: config.directory,
            // ast: precinct.ast,
            config: config.requireConfig,
            webpackConfig: config.webpackConfig,
            nodeModulesConfig: config.nodeModulesConfig
        });

        if (!result) {
            debug('skipping an empty filepath resolution for partial: ' + dep);
            config.nonExistent.push(dep);
            continue;
        }
        const exists = fs.existsSync(result);

        if (!exists) {
            config.nonExistent.push(dep);
            debug('skipping non-empty but non-existent resolution: ' + result + ' for partial: ' + dep);
            continue;
        }

        dependencies[i].src = result
        // resolvedDependencies.push(result);
    }
    dependencies = dependencies.filter(d => d.src !== 'E:\\Workspace\\Visualization\\srcCodeHelperServer\\data\\d3\\src\\dist\\package.js')
    dependencies = dependencies.filter(d => (d.src !== 'he')&&(d.src !== 'de-indent'))
    return dependencies;
}

module.exports = DepMap;
