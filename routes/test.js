const code = require("fs").readFileSync("/Users/wendahuang/Desktop/vue/src/compiler/codegen/events.js", "utf-8");
// console.log(code)
const traverse = require("@babel/traverse").default;


const ast = require("@babel/parser").parse(code, {
    // parse in strict mode and allow module declarations
    sourceType: "module",
    plugins: [
        // enable jsx and flow syntax
        "flow"
    ]
});
// console.log(ast)
var indent = "";

const visitor = {
    FunctionDeclaration(path) {
        console.log(path.node.loc, path.node.id.name)
    }
}
traverse(ast,visitor);