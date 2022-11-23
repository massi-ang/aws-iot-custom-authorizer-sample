function long_work() {
 return new Promise((resolve, reject)=> {
 setTimeout(resolve, 1000);})}

(async () => {
 await long_work();
 console.log('Done');
})()
