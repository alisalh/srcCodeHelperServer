var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
const babelTraverse = require("@babel/traverse").default;
const babelParser = require("@babel/parser")
const EventEmitter = require('events');
var dependencyTree = require('dependency-tree')
let _ = require("underscore")
const vueSrc = '/Users/wendahuang/Desktop/vue/';

router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});


router.get('/getFolderHierarchyAndFileInfo', function(req, res, next) {
    const lenThreshold = req.query.lenThreshold,
        depInfo = getDepInfo(lenThreshold)
    // res.send({depInfo})
    const root = getFileInfo(depInfo)
    res.send({ root, badDeps: depInfo.badDeps, lenDis: depInfo.lenDis })
});

// 返回文件的依赖信息：三种坏依赖关系数组，依赖图的邻接表表示
function getDepInfo(lenThreshold) {
    let arr = [],
        maxLen = -1,
        depMapInfo = new dependencyTree({
            filename: path.resolve(vueSrc, 'src/platforms/web/entry-runtime-with-compiler.js'),
            directory: path.resolve(vueSrc),
            webpackConfig: path.resolve(vueSrc, 'src/vuePackConfig.js'), // optional
            nonExistent: arr, // optional
            lenThreshold
        })
    maxLen = depMapInfo.depHell.long.slice().sort((a, b) => b.length - a.length)[0].length
    return {
        badDeps: [{ type: 'long', paths: backWardsCompat(depMapInfo.depHell.long, 0, 'long'), threshold: lenThreshold, maxLen },
            { type: 'indirect', paths: backWardsCompat(depMapInfo.depHell.indirect, depMapInfo.depHell.long.length, 'indirect') },
            { type: 'direct', paths: backWardsCompat(depMapInfo.depHell.direct, depMapInfo.depHell.indirect.length, 'direct') },
            { type: 'scc', paths: [] }
        ],
        depMap: depMapInfo.depMap,
        lenDis: depMapInfo.lenDis
    }
}

// 对用新逻辑获取的badDeps进行向后接口的兼容
function backWardsCompat(deps, offset, type) {
    return deps.map((d) => ({
        id: offset++,
        path: d,
        type
    }))
}

// 返回文件夹的层次结构，以及文件的基本统计信息（文件大小、文件所包含函数、依赖和被依赖文件，坏依赖数）
function getFileInfo({ badDeps, depMap }) {
    let directory = path.resolve(vueSrc, 'src'),
        root = {
            name: directory,
            type: 'dir',
            children: []
        },
        blackList = ['.DS_Store']
    readDirSync(directory, root)
    let depth = getTreeDepth(root)
    // console.log(depth)
    equalizeDepth(root, depth)
    return root

    function readDirSync(rootPath, root) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function(ele, index) {
            // console.log(ele)
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                // console.log("dir: "+ele)
                let tmpdir = { name: curPath, children: [], type: 'dir' }
                root.children.push(tmpdir)
                readDirSync(curPath, tmpdir);
            } else {
                root.children.push({
                    name: curPath,
                    type: 'file',
                    fileInfo: Object.assign({}, { size: info.size },
                        extractFunc(curPath),
                        extractBadDeps(curPath, badDeps),
                        extractFileDep(curPath, depMap)
                    )
                })
                // console.log("file: "+ele)
            }
        })
    }
}

function extractFunc(fpath) {
    const code = fs.readFileSync(fpath, "utf-8"),
        fileInfo = { func: [] },
        ast = babelParser.parse(code, {
            // parse in strict mode and allow module declarations
            sourceType: "module",
            plugins: [
                // enable jsx and flow syntax
                "flow"
            ]
        }),
        visitor = {
            FunctionDeclaration(path) {
                const loc = path.node.loc
                fileInfo.func.push({
                    lineNum: loc.end.line - loc.start.line + 1,
                    name: path.node.id.name
                })
            }
        }

    babelTraverse(ast, visitor);
    return fileInfo;
}

function extractBadDeps(fpath, badDeps) {
    const fileBadDeps = {}
    for (let dep of badDeps) {
        let type = dep.type,
            paths = dep.paths,
            filteredDeps = paths.filter(d => d.path.indexOf(fpath) !== -1)
        fileBadDeps[type] = filteredDeps
    }
    return fileBadDeps
}

function extractFileDep(fpath, depMap) {
    let depending = depMap[fpath] || [],
        depended = [],
        val, idx;
    Object.keys(depMap).forEach((key) => {
        val = depMap[key]
        idx = val.findIndex(d => d.src === fpath)
        if (idx !== -1) {
            depended.push({
                src: val[idx].src,
                specifiers: val[idx].specifiers
            })
        }
    })
    return {
        depending,
        depended
    }
}

function getTreeDepth(root) {
    let maxLen = -1

    function dfs(root, len) {
        if (!root.children) {
            if (len > maxLen)
                maxLen = len
            return
        }
        for (let i = 0; i < root.children.length; i++) {
            dfs(root.children[i], len + 1)
        }
    }
    dfs(root, 0)
    return maxLen
}

function equalizeDepth(root, depth) {
    function dfs(root, len) {
        if (root.type === 'file') {
            let tmpSize = root.size,
                rootStr
            //only leaves in the resulting dendrogram should contain 'size' prop
            delete root.size
            rootStr = JSON.stringify(root)
            while (len < depth) {
                let tmp = JSON.parse(rootStr)
                root.children = [tmp]
                root = tmp
                len++
            }
            root.size = tmpSize
            return
        }
        for (let i = 0; i < root.children.length; i++) {
            dfs(root.children[i], len + 1)
        }
    }
    dfs(root, 0)
}


module.exports = router;