// import {MultiBar, Presets, SingleBar} from 'cli-progress';

// import { noop } from "../network/utils";

// const multibar = new MultiBar({
//     clearOnComplete: false,
//     hideCursor: false,
//     format: ' {bar} | "{cid}" | {value}/{total}',
//     // barCompleteChar: '\u2588',
//     // barIncompleteChar: '\u2591',
//     stopOnComplete: false,
//     fps:8
// });

// const logProgress = (total, name="") => { 
    
//     const bar = multibar.create(total, 0, {name});

//     const update = increment => {
//         bar.increment(increment);
//     }

//     const remove = () => {
//         // bar.stop();
//         multibar.remove(bar);
//     }

//     return [update, remove];
// } 

// export default logProgress;

// export const logProgressAsync = async function* (iterator, total, name)  {
//     const [log, remove] = logProgress(total,name);
//     for await (const chunk of iterator) {
//         log(chunk.length,name);
//         yield(chunk);
//     }
//     remove();
// }

// import { MultiProgressBars } from 'multi-progress-bars';

// import pProgress from "p-progress";
// const mpb = new MultiProgressBars({stream:process.stderr, anchor:"bottom"});

export default () => null;

export const logProgressAsync = it => it;

let globalBarIndex = 0;

export const PromiseAllProgress = (name, promises) => Promise.all(promises);
// {
//     const promiseProgress = pProgress.all(promises);
//     globalBarIndex++;
//     const barIndex = globalBarIndex;
//     mpb.addTask(name, {type:"percentage",index: barIndex});
//     promiseProgress.onProgress(p => {
//         // console.log(p)
//         mpb.updateTask(name, p);
//         if (p >= 1) {
//             mpb.done(name);
//             globalBarIndex--;
//         }
//     })
//     return promiseProgress;
// };

