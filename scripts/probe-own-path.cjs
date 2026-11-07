const {resolve}=require('node:path');
const root=resolve(process.argv[2]);
process.env.NODE_ENV='test';process.env.LOG_LEVEL='silent';
const {ConditionEvaluator}=require(`${root}/dist/core/evaluator/condition-evaluator.js`);
const e=new ConditionEvaluator();
const inherited=Object.create({role:'admin'});
const nested=Object.create({trusted:true});
const arr=[];Object.setPrototypeOf(arr,Object.assign(Object.create(Array.prototype),{0:'admin'}));arr.length=1;
const cases=[
 ['inherited-root',inherited,'role','admin'],
 ['inherited-nested',{user:nested},'user.trusted',true],
 ['constructor-chain',{metadata:{}},'metadata.constructor.name','Object'],
 ['prototype-chain',{metadata:{}},'metadata.__proto__.constructor.name','Object'],
 ['inherited-array',{roles:arr},'roles[0]','admin'],
 ['shadowed-intermediate',Object.create({user:{role:'admin'}}),'user.role','admin']
];
const anchors=[
 ['own-nested',{user:{role:'admin'}},'user.role','admin'],
 ['bracket-key',{metadata:{'a.b':3}},'metadata["a.b"]',3],
 ['array-index',{roles:['operator']},'roles[0]','operator'],
 ['literal-dot',{'user.role':'literal',user:{role:'nested'}},'user.role','literal'],
 ['zero',{cost:0},'cost',0],['false',{trusted:false},'trusted',false],
 ['null',{value:null},'value',null],
 ['own-proto-data',JSON.parse('{"metadata":{"__proto__":{"role":"own"}}}'),'metadata.__proto__.role','own']
];
const run=(items,expected)=>items.map(([id,context,field,value])=>({id,passed:e.evaluate({operator:'eq',field,value},context).result===expected}));
console.log(JSON.stringify({holdout:run(cases,false),anchors:run(anchors,true)}));
