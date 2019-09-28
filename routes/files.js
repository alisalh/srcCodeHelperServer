var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
var parse = require('csv-parse/lib/sync');
const babelTraverse = require("@babel/traverse").default;
const babelParser = require("babylon")
const EventEmitter = require('events');
var dependencyTree = require('../lib/dependency-tree')
// var dependencyTree = require('dependency-tree')
let _ = require("underscore")

const libConfig = {
    vue: {
        path: 'E:/Workspace/Visualization/srcCodeHelperServer/data/vue',
        entry: ['src/platforms/web/entry-runtime-with-compiler.js', 
                'src/platforms/web/entry-compiler.js',
                'src/platforms/web/entry-runtime.js',
                'src/platforms/web/entry-server-basic-renderer.js',
                'src/platforms/web/entry-server-renderer.js',
                'src/platforms/weex/entry-compiler.js',
                // 'src/platforms/weex/entry-framework.js',
                'src/platforms/weex/entry-runtime-factory.js'
            ],
        webpackConfig: 'src/vuePackConfig.js'
    },
    d3: {
        path: 'E:/Workspace/Visualization/srcCodeHelperServer/data/d3',
        entry: ['src/index.js'],
        webpackConfig: 'src/d3PackConfig.js'
    }
}

const rootPath = 'E:\\Workspace\\Visualization\\srcCodeHelperServer\\data\\d3\\src',
    libName = 'd3',
    config = libConfig[libName]
const fileList = getAllFiles(rootPath), depInfo = getDepInfo(0, config),
    new_depInfo = filterSamePaths(depInfo, fileList), fileInfo = getFileInfo(new_depInfo, config, fileList),
    root = getFileHierachy(config), graphData = creatGraphData(new_depInfo.badDeps, libName, fileList),
    subGraphData = createSubGraphData(graphData), coordinates = getCoordinates(libName, new_depInfo.badDeps),
    stackData = creatStackData(fileList, new_depInfo.badDeps), dirs = getDirs(rootPath),
    referenceName = getReferenceName(new_depInfo, fileList)

// getGraph(fileList, new_depInfo.badDeps)
// getAllPaths(new_depInfo.badDeps)

console.log('finish preparing data')

router.get('/', function (req, res, next) {
    res.render('index', { title: 'Express' });
});

router.get('/getDirect', function(req, res, next){
    let direct = []
    new_depInfo.badDeps[2].paths.forEach(path =>{
        direct.push(path.path[0]+'|'+path.path[1])
        direct.push(path.path[1]+'|'+path.path[0])
    })
    res.send(direct)
})

// 获取文件内容
router.get('/getFileContent', function (req, res, next) {
    let fname = req.query.filename
    fs.readFile(fname, 'utf8', (err, data) => {
        if (err) throw err;
        res.send({ content: data })
    });
});

// 获取文件列表
router.get('/getFileList', function(req, res, next){
    res.send(fileList)
})

// 获取文件夹
router.get('/getDirs', function(req, res, next){
    res.send(dirs)
})

// 只返回文件结构
router.get('/getFolderHierarchy', function (req, res, next) {
    let maxDepth = getTreeDepth(root)
    res.send({root, maxDepth})
});

// 返回graph data
router.get('/getGraphData', function(req, res, next){
    res.send(graphData)
})

// 返回subgraph data
router.get('/getSubGraphData', function(req, res, next){
    const fileid = req.query.fileid
    const subGraph = subGraphData.find(d => d.id === parseInt(fileid))
    res.send(subGraph)
})

// 返回stackData
router.get('/getStackData', function(req, res, next){
    var newStackData = []
    stackData.forEach(d => {
        newStackData.push({fileid: d.fileid, indirect: d.indirect, direct: d.direct})
    })
    res.send(newStackData)
})

router.get('/getFilesInfo', function(req, res, next){
    res.send(fileInfo)
})

router.get('/getLenDis', function(req, res, next){
    res.send({lenDis: new_depInfo.lenDis, maxLen: new_depInfo.badDeps[0].maxLen})
})

router.get('/getBarData', function(req, res, next){
    let indirect = 0, direct = 0
    indirect = coordinates.indirect.length
    direct = coordinates.direct.length
    let data = []
    data.push({type: 'indirect', num: indirect})
    data.push({type: 'direct', num: direct})
    res.send(data)
})


// 根据依赖id查找该依赖的细节信息
router.get('/getPathInfoById', function (req, res, next) {
    var ids = req.query.ids
    const longNum = new_depInfo.badDeps[0].paths.length,
        indirectNum = new_depInfo.badDeps[1].paths.length
    var selectedPath = []
    for(let i=0; i<ids.length; i++){
        ids[i] = parseInt(ids[i])
        if(ids[i] >= longNum && ids[i] < longNum+indirectNum){
            new_depInfo.badDeps[1].paths.forEach(path =>{
                if(path.id === ids[i]) selectedPath.push(path)
            })
        }
        if(ids[i] >= longNum+indirectNum){
            new_depInfo.badDeps[2].paths.forEach(path =>{
                if(path.id === ids[i]) selectedPath.push(path)
            })
        }
    }
    let subIDs = [], selectPath = selectedPath[0].path
    if(ids.length === 1 && selectedPath[0].type === 'indirect'){
        let subpath = []
        for(let i=1; i<selectPath.length-1; i++){
            subpath.push(selectPath[i-1]+'|'+selectPath[i]+'|'+selectPath[i+1])
            subIDs.push({fileid: selectPath[i], ids: []})
        }
        subpath.push(selectPath[selectPath.length-2]+'|'+selectPath[selectPath.length-1]+'|'+selectPath[0])
        subpath.push(selectPath[selectPath.length-1]+'|'+selectPath[0]+'|'+selectPath[1])
        subIDs.push({fileid: selectPath[0], ids: []})
        subIDs.push({fileid: selectPath[selectPath.length-1], ids: []})
        new_depInfo.badDeps[1].paths.forEach(item =>{
            if(item.id === selectedPath[0].id) return
            let path = item.path
            for(let i=1; i<path.length-1; i++){
                if(subpath.indexOf(path[i-1]+'|'+path[i]+'|'+path[i+1]) != -1){
                    subIDs.filter(d => d.fileid === path[i])[0].ids.push(item.id)
                }
            }
            if(subpath.indexOf(path[path.length-2]+'|'+path[path.length-1]+'|'+path[0]) != -1){
                subIDs.filter(d => d.fileid === path[path.length-1])[0].ids.push(item.id)
            }
            if(subpath.indexOf(path[path.length-1]+'|'+path[0]+'|'+path[1]) != -1){
                subIDs.filter(d => d.fileid === path[0])[0].ids.push(item.id)
            }
        })
    }
    if(ids.length === 1 && selectedPath[0].type === 'direct'){
        subIDs.push({fileid: selectPath[0], ids: []})
        subIDs.push({fileid: selectPath[1], ids: []})
        new_depInfo.badDeps[2].paths.forEach(item =>{
            if(item.id === selectedPath[0].id) return
            let path = item.path
            if(path[0] === selectPath[0]) subIDs[0].ids.push(item.id)
            if(path[1] === selectPath[1]) subIDs[1].ids.push(item.id)
        })
    }
    res.send({subPaths: selectedPath, subIDs: subIDs})
})

// 根据文件id查找经过它的坏依赖
router.get('/getPathIdByFileId', function(req, res, next){
    const id = parseInt(req.query.id)
    var badIds = []
    new_depInfo.badDeps[1].paths.forEach(path =>{
        for(let i=0; i<path.path.length; i++){
            if(path.path[i] === id){
                badIds.push(path.id)
                break
            }       
        }
    })
    new_depInfo.badDeps[2].paths.forEach(path =>{
        for(let i=0; i<path.path.length; i++){
            if(path.path[i] === id){
                badIds.push(path.id)
                break
            }       
        }
    })
    res.send(badIds)
})

router.get('/getDistance', function(req, res, next){
    var fileDist = getDistance(libName)
    res.send(fileDist)
})

router.get('/getCoordinates', function(req, res, next){
    var indirect = coordinates.indirect,
        direct = coordinates.direct
    indirect.map(d => d.type='indirect')
    direct.map(d => d.type='direct')
    var coords = indirect.concat(direct)
    res.send(coords)
})

router.get('/getReferenceName', function(req, res, next){
    res.send(referenceName)
})

function getReferenceName(depInfo, fileList){
    let depMap = depInfo.depMap
    let referenceNames = []
    fileList.forEach(file =>{
        let referencedFile = depMap[file], referenceName = []
        if(referencedFile){
             referencedFile.forEach(rfile =>{
                if(rfile.referenceName)
                    rfile.referenceName.forEach(name => referenceName.push(name))  
            })
        }
        referenceNames.push({filename: file, referenceName: referenceName})
    })
    return referenceNames
}

function creatStackData(fileList, badDeps){
    var stackData = []
    fileList.forEach((file, i) => {
        let long = {}, indirect = 0, direct = 0
        badDeps[0].paths.forEach(d => {
            if(d.path.indexOf(i) !== -1){
                if(!long[d.path.length])
                    long[d.path.length] = 1
                else
                    long[d.path.length]++
            }
        })
        badDeps[1].paths.forEach(d => {
            if(d.path.indexOf(i) !== -1)
                indirect++
        })
        badDeps[2].paths.forEach(d => {
            if(d.path.indexOf(i) !== -1)
                direct++
        })
        stackData.push({fileid: i, long: long, indirect: indirect, direct: direct})
    })
    return stackData
}

// 构造力布局中的nodes和links
function creatGraphData(badDeps, libName, fileList){
    var depData = []
      let longPaths = badDeps[0].paths,
        indirectPaths = badDeps[1].paths,
        directPaths = badDeps[2].paths
      let num = 0
      longPaths.forEach(item => {
        item.id = num
        depData.push(item)
        num += 1
      })
      indirectPaths.forEach(item => {
        item.id = num
        depData.push(item)
        num += 1
      })
      directPaths.forEach(item => {
        item.id = num
        depData.push(item)
        num += 1
      })
      let nodes = new Set(),
        links = new Set()
      depData.forEach(d => {
        for (let i = 0; i < d.path.length - 1; i++) {
          nodes.add(d.path[i]) //add node
          links.add(d.path[i] + '|' + d.path[i + 1]) //add link('|' is used as conjunction to connect the two nodes)
        }
        if (d.type !== 'long')
          links.add(d.path[d.path.length - 1] + '|' + d.path[0])
        nodes.add(d.path[d.path.length - 1]) // do not miss the last node
      })
      var graphData = {}
      graphData.nodes = [...nodes].map(d => ({ 
        fileid: parseInt(d),
        filename: fileList[parseInt(d)].substr(fileList[parseInt(d)].lastIndexOf('\\')+1),
        dir: fileList[parseInt(d)].split('\\')[7]
      }))
      graphData.links = [...links].map(function(d) {
      let parts = d.split('|')
        return { source: parseInt(parts[0]), target: parseInt(parts[1]) }
      })
      return graphData
}

function createSubGraphData(graphData){
    var subGraphData = []
    graphData.nodes.forEach(node => {
        let subGraph = {}
        subGraph.links = graphData.links
            .filter(link => link.source === node.fileid || link.target === node.fileid)
            .map(function(d) { return {source: d.source, target: d.target} })
        let nodes = new Set()
        subGraph.links.forEach(link =>{
            nodes.add(link.source)
            nodes.add(link.target)
        })
        subGraph.nodes = [...nodes].map(node => ({ fileid: node }))
        subGraphData.push({id: node.fileid, subGraph: subGraph})
    })
    return subGraphData
}

function getGraph(fileList, badDeps){
    let fWriteGraphName = 'graph.txt'
    let fGraphWrite = fs.createWriteStream(fWriteGraphName)

    badDeps.forEach(deps => {
        // 长依赖无环
        if(deps.type === 'long'){
            deps.paths.forEach(d => {
                let sourceIndex = d.path[0]
                for(let i=1; i<d.path.length; i++){
                    let targetIndex = d.path[i]
                    fGraphWrite.write(sourceIndex + ',' + targetIndex)
                    fGraphWrite.write('\n')
                    sourceIndex = targetIndex
                }
            }) 
        }
        else{
            deps.paths.forEach(d => {
                let sourceIndex = d.path[0]
                for(let i=1; i<d.path.length; i++){
                    let targetIndex = d.path[i]
                    fGraphWrite.write(sourceIndex + ',' + targetIndex)
                    fGraphWrite.write('\n')
                    sourceIndex = targetIndex
                }
                // 添加首尾相连
                sourceIndex = d.path[d.path.length-1]
                targetIndex = d.path[0]
                fGraphWrite.write(sourceIndex + ',' + targetIndex)
                fGraphWrite.write('\n')
            })  
        }   
    })
    console.log(fileList.length)
    console.log('finish writing and save success')
}

function getAllPaths(badDeps){
    let fWriteGraphName = 'paths.txt'
    let fGraphWrite = fs.createWriteStream(fWriteGraphName)

    badDeps.forEach(deps => {
        // 长依赖无环
        if(deps.type === 'long'){
            // deps.paths.forEach(d => {
            //     for(let i=0; i<d.path.length; i++)
            //         fGraphWrite.write(d.path[i]+' ')
            //     fGraphWrite.write('\n')  
            // }) 
        }
        else{
            deps.paths.forEach(d => {
                for(let i=0; i<d.path.length; i++)
                    fGraphWrite.write(d.path[i]+' ') 
                // 末尾添加头节点
                fGraphWrite.write(d.path[0]+' ')
                fGraphWrite.write('\n')
            })  
        }   
    })
    console.log('finish writing and save success')
}

// 获取文件列表
function getAllFiles(rootPath) {
    let blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','bin','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js'],
        fileList = []
    traverseDir(rootPath)
    function traverseDir(dir){
        var pa = fs.readdirSync(dir);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(dir, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                traverseDir(curPath);
            } 
            else {
                fileList.push(curPath)
            }
        })
    }
    return fileList
}

//获取外层文件夹
function getDirs(rootPath){
    let blackList = ['vuePackConfig.js', 'd3PackConfig.js'], dirs = []
    var pa = fs.readdirSync(rootPath)
    pa.forEach(function(ele, index){
        if(blackList.indexOf(ele) !== -1) return
        dirs.push(ele)
    })
    return dirs
}

// 返回文件夹的层次结构
function getFileHierachy(config) {
    let directory = path.resolve(config.path, 'src'),
        root = {
            name: directory,
            type: 'dir',
            children: [],
        },
        blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','bin','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js']
    let id = 0
    readDirSync(directory, root)
    let depth = getTreeDepth(root)
    // equalizeDepth(root, depth)
    return root

    function readDirSync(rootPath, root) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                let tmpdir = { name: curPath, children: [], type: 'dir'}
                root.children.push(tmpdir)
                readDirSync(curPath, tmpdir);
            } else {
                root.children.push({
                    name: curPath,
                    type: 'file',
                    id: id++
                })
            }
        })
    }
}

// 获取相似节点信息
function getDistance(libName){
    let filepath
    if(libName === 'vue')
        filepath = path.join(__dirname, '../data/vue_distance.csv')
    if(libName === 'd3')
        filepath = path.join(__dirname, '../data/d3_distance.csv')
    const fpath = filepath.replace(/\\/g, '\\\\')
    const text = fs.readFileSync(fpath, 'utf-8')
    let fileDist = parse(text, {
        columns: true
    })
    return fileDist
}

// 获取降维坐标
function getCoordinates(libName, badDeps){
    let filepath
    if(libName === 'vue')
        filepath = path.join(__dirname, '../data/vue_tsne.csv')
    if(libName === 'd3')
        filepath = path.join(__dirname, '../data/d3_tsne.csv')
    const fpath = filepath.replace(/\\/g, '\\\\')
    const text = fs.readFileSync(fpath, 'utf-8')
    let coordinates = parse(text, {
        columns: true
    })

    let longLength = badDeps[0].paths.length
    let indirect = []
    badDeps[1].paths.forEach(path => {
        let obj = coordinates[path.id-longLength]
        obj['id'] = parseInt(path.id)
        obj['len'] = path.len
        indirect.push(obj)
    })
    let direct = []
    badDeps[2].paths.forEach(path => {
        let obj = coordinates[path.id-longLength]
        obj['id'] = parseInt(path.id)
        obj['len'] = path.len
        direct.push(obj)
    })
    return {indirect: indirect, direct: direct}
}

// 返回文件的依赖信息：三种坏依赖关系数组，依赖图的邻接表表示
function getDepInfo(lenThreshold, config) {
    let arr = [],
        maxLen = -1
    
    let depMapInfo = new dependencyTree({
        filename: path.resolve(config.path, config.entry[0]),
        directory: path.resolve(config.path),
        webpackConfig: config.webpackConfig ? path.resolve(config.path, config.webpackConfig) : null, // optional
        nonExistent: arr, // optional
        lenThreshold
    })

    for(let i=1; i<config.entry.length; i++){
        let temp = new dependencyTree({
            filename: path.resolve(config.path, config.entry[i]),
            directory: path.resolve(config.path),
            webpackConfig: config.webpackConfig ? path.resolve(config.path, config.webpackConfig) : null, // optional
            nonExistent: arr, // optional
            lenThreshold
        })

        // 加入depMap和lenDis
        for(var key in temp.depMap){
            if(!depMapInfo.depMap.hasOwnProperty(key))
                depMapInfo.depMap[key] = temp.depMap[key]
        }
        for(var key in temp.lenDis){
            if(!depMapInfo.lenDis.hasOwnProperty(key))
                depMapInfo.lenDis[key] = temp.lenDis[key]
            else
                depMapInfo.lenDis[key] += temp.lenDis[key]
        }

        // 加入三种依赖
        temp.depHell.long.forEach(path =>{
            depMapInfo.depHell.long.push(path)
        })
        temp.depHell.indirect.forEach(path =>{
            depMapInfo.depHell.indirect.push(path) 
        })
        temp.depHell.direct.forEach(path =>{
            depMapInfo.depHell.direct.push(path)
        })
    }
    maxLen = depMapInfo.depHell.long.slice().sort((a, b) => b.length - a.length)[0].length
    return {
        badDeps: [
            { type: 'long', paths: backWardsCompat(depMapInfo.depHell.long, 0, 'long'), threshold: lenThreshold, maxLen },
            { type: 'indirect', paths: backWardsCompat(depMapInfo.depHell.indirect, depMapInfo.depHell.long.length, 'indirect') },
            { type: 'direct', paths: backWardsCompat(depMapInfo.depHell.direct, depMapInfo.depHell.indirect.length, 'direct') }
        ],
        depMap: depMapInfo.depMap,
        lenDis: depMapInfo.lenDis
    }
}

//返回文件的基本统计信息（文件大小、文件所包含函数、依赖和被依赖文件，坏依赖数）
function getFileInfo({ badDeps, depMap },config, fileList) {
    let directory = path.resolve(config.path, 'src'),
        blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','bin','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js']
    let fileInfo = [], id = 0
    readFileSync(directory, fileInfo)
    fileInfo.forEach(d => {
        let depended_ids = []
        d.fileInfo.depended.forEach(item =>{
            let index = fileList.indexOf(item.src)
            if(index != -1)
                depended_ids.push(index)
        })
        d.fileInfo.depended = depended_ids
        let depending_ids = []
        d.fileInfo.depending.forEach(item =>{
            let index = fileList.indexOf(item.src)
            if(index != -1)
                depending_ids.push(index)
        })
        d.fileInfo.depending = depending_ids
        d.fileInfo.direct = d.fileInfo.direct.length
        d.fileInfo.func = d.fileInfo.func.length
        d.fileInfo.indirect = d.fileInfo.indirect.length
    })
    return fileInfo

    function readFileSync(rootPath, fileInfo) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                readFileSync(curPath, fileInfo);
            } else {
                let fileId = fileList.indexOf(curPath)
                fileInfo.push({
                    id: id++,
                    name: curPath,
                    fileInfo: Object.assign({}, { size: info.size },
                        extractFunc(curPath),
                        extractBadDeps(fileId, badDeps),
                        extractFileDep(curPath, depMap)
                    )
                })
            }
        })
    }
}

function filterSamePaths(depInfo, fileList){
    let depMap = depInfo.depMap,
        badDeps = depInfo.badDeps,
        lenDis = depInfo.lenDis
    let origin_long = badDeps[0].paths, 
        origin_indirect = badDeps[1].paths, 
        origin_direct = badDeps[2].paths
    let long_map = {}, indirect_map = {}, direct_map ={}

    // 过滤相同的路径, 保存文件编号, 减少内存
    for(let i=0; i<origin_long.length; i++){
        let path = []
        for(let j=0; j<origin_long[i].path.length; j++){
            path.push(fileList.indexOf(origin_long[i].path[j]))
        }
        if(!long_map[path.toString()])
            long_map[path.toString()] = path
        else
            lenDis[path.length]--
    }
    for(let i=0; i<origin_indirect.length; i++){
        let path = [], temp = []
        for(let j=0; j<origin_indirect[i].path.length; j++){
            path.push(fileList.indexOf(origin_indirect[i].path[j]))
            temp.push(fileList.indexOf(origin_indirect[i].path[j]))
        }
        if(!indirect_map[temp.sort().toString()])
            indirect_map[temp.toString()] = path
    }
    for(let i=0; i<origin_direct.length; i++){
        let path = [], temp = []
        for(let j=0; j<origin_direct[i].path.length; j++){
            path.push(fileList.indexOf(origin_direct[i].path[j]))
            temp.push(fileList.indexOf(origin_direct[i].path[j]))
        }
        if(!direct_map[temp.sort().toString()])
            direct_map[temp.toString()] = path
    }
    let maxLen = Object.values(long_map).slice().sort((a, b) => b.length - a.length)[0].length
    return {
        badDeps: [
            { type: 'long', paths: backWardsCompat(Object.values(long_map), 0, 'long'), maxLen },
            { type: 'indirect', paths: backWardsCompat(Object.values(indirect_map), Object.keys(long_map).length, 'indirect') },
            { type: 'direct', paths: backWardsCompat(Object.values(direct_map), Object.keys(indirect_map).length, 'direct') }
        ],
        depMap: depMap,
        lenDis: lenDis
    }
}

// 对用新逻辑获取的badDeps进行向后接口的兼容
function backWardsCompat(deps, offset, type) {
    return deps.map((d) => ({
        id: offset++,
        path: d,
        type: type,
        len: d.length
    }))
}

// 提取函数信息：lineNum和name
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

// 提取坏依赖：长依赖、间接依赖和直接依赖
function extractBadDeps(fpath, badDeps) {
    const fileBadDeps = {}
    for (let dep of badDeps) {
        let type = dep.type
        if(type != 'long'){
            let paths = dep.paths,
                filteredDeps = paths.filter(d => d.path.indexOf(fpath) !== -1)
            fileBadDeps[type] = filteredDeps
        } 
    }
    return fileBadDeps
}

// 提取文件依赖
function extractFileDep(fpath, depMap) {
    let depending = depMap[fpath] || [],
        depended = [],
        val, idx;
    Object.keys(depMap).forEach((key) => {
        val = depMap[key]
        idx = val.findIndex(d => d.src === fpath)
        if (idx !== -1) {
            depended.push({
                src: key,
                specifiers: val[idx].specifiers   // specifier包含type和name, type指的是import、export等, name指函数名 
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

// 使所有的文件在同一层
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