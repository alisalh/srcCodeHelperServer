var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
const babelTraverse = require("@babel/traverse").default;
const babelParser = require("@babel/parser")
const EventEmitter = require('events');
var dependencyTree = require('dependency-tree')
let _ = require("underscore")

const libConfig = {
    vue: {
        path: '/Users/wendahuang/Desktop/vue/',
        entry: 'src/platforms/web/entry-runtime-with-compiler.js',
        webpackConfig: 'src/vuePackConfig.js'
    },
    d3Hierarchy: {
        path: '/Users/wendahuang/Desktop/d3',
        entry: 'src/index.js',
        webpackConfig: 'src/d3PackConfig.js'
    }
}
const vueSrc = '/Users/wendahuang/Desktop/vue/';

router.get('/', function (req, res, next) {
    res.render('index', { title: 'Express' });
});

// 获取文件内容
router.get('/getFileContent', function (req, res, next) {
    let fname = req.query.filename
    fs.readFile(fname, 'utf8', (err, data) => {
        if (err) throw err;
        res.send({ content: data })
    });
});

router.get('/getFolderHierarchyAndFileInfo', function (req, res, next) {
    const lenThreshold = req.query.lenThreshold,
        libName = req.query.libName,
        config = libConfig[libName]
    depInfo = getDepInfo(lenThreshold, config)
    // res.send({depInfo})
    const root = getFileInfo(depInfo, config)
    res.send({ root, badDeps: depInfo.badDeps, lenDis: depInfo.lenDis })
});

// 根据依赖id查找该依赖的细节信息
router.get('/getDetailBadDepInfoByDepId', function (req, res, next) {
    const { lenThreshold, depId, type, libName } = req.query
    depInfo = getDepInfo(lenThreshold, libConfig[libName])
    const { badDeps, depMap } = depInfo
    const detailPath = badDeps.find(d => d.type === type).paths.find(d => d.id === parseInt(depId)).path,
        len = detailPath.length
    // console.log(detailPath)
    let links = [],
        target,
        src
    detailPath.forEach((val, idx) => {
        if (idx === len - 1) return
        src = val
        target = detailPath[idx + 1]
        const edge = depMap[src].find(d => d.src === target)
        links.push({
            source: src,
            target: edge.src,
            specifiers: edge.specifiers
        })
    })
    // 如果是循环依赖（直接或者间接），要把最后一条边信息补上
    if (type === 'indirect' || type === 'direct') {
        src = detailPath[len - 1]
        target = detailPath[0]
        links.push({
            source: src,
            target,
            specifiers: depMap[src].find(d => d.src === target).specifiers
        })
    }
    res.send({
        nodes: detailPath,
        links
    })
})

// 返回文件的依赖信息：三种坏依赖关系数组，依赖图的邻接表表示
function getDepInfo(lenThreshold, config) {
    let arr = [],
        maxLen = -1,
        depMapInfo = new dependencyTree({
            filename: path.resolve(config.path, config.entry),
            directory: path.resolve(config.path),
            webpackConfig: config.webpackConfig ? path.resolve(config.path, config.webpackConfig) : null, // optional
            nonExistent: arr, // optional
            lenThreshold
        })
    maxLen = depMapInfo.depHell.long.slice().sort((a, b) => b.length - a.length)[0].length
    // console.log(depMapInfo)
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
function getFileInfo({ badDeps, depMap }, config) {
    let directory = path.resolve(config.path, 'src'),
        root = {
            name: directory,
            type: 'dir',
            children: []
        },
        blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale']
    readDirSync(directory, root)
    let depth = getTreeDepth(root)
    // console.log(depth)
    equalizeDepth(root, depth)
    return root

    function readDirSync(rootPath, root) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function (ele, index) {
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
        visitor = {
            FunctionDeclaration(path) {
                const loc = path.node.loc
                path.node.id && fileInfo.func.push({
                    lineNum: loc.end.line - loc.start.line + 1,
                    name: path.node.id.name
                })
            }
        }
    let ast = null
    try {
        ast = babelParser.parse(code, {
            // parse in strict mode and allow module declarations
            sourceType: "module",
            plugins: [
                // enable jsx and flow syntax
                "flow"
            ]
        })
    } catch (e) {
        console.log(e)
        console.log(fpath)
        process.exit(1)
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