初始化该项目操作：
mkdir mr-review-cli
cd mr-review-cli
npm init -y
npm install -D typescript tsx @types/node
npx tsc --init

目前 CLI 已经能：

- 获取 Git diff。
- 识别新增、修改、删除的文件。
- 筛选出需要审查的新增和修改文件。
- 通过自身的 TypeScript 类型检查。

代码比较命令：npx tsx src/index.ts "D:\workspace\water-drop-pc" main
