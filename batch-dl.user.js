// ==UserScript==
// @name        Batch Downloader
// @description Batch Download image
// @version     0.2.0
// @include     *://localhost*
// @include     *://i.imgur.com/*
// @include     *://*.archive.org/BookReader/BookReader*.php?*
// @grant       none
// @require     https://raw.githubusercontent.com/Stuk/jszip/v3.1.5/dist/jszip.min.js
// @require     https://raw.githubusercontent.com/eligrey/FileSaver.js/master/dist/FileSaver.min.js
// ==/UserScript==

var waitForElement = 'body';
var poolSize = 5;

var pool = {}, poolQueue = {};

var addToPool = function(id, f){
    // if (Object.keys(pool).length < poolSize) {
    //     // add to pool and proc
    //     pool[id] = f().then(res => {
    //         delete pool[id]
    //         return res
    //     });
    //     return pool[id]
    // }
    const promisesPoolQueue = Object.values(poolQueue);
    poolQueue[id] = Promise.all(promisesPoolQueue)
        .then(_ => {
            const promisesPool = Object.values(pool);
            if (Object.keys(pool).length < poolSize) {
                // pool still has space
                return Promise.resolve(id)
            }
            // wait until pool has space
            return Promise.race(promisesPool)
        }).then(_ => {
            delete poolQueue[id]
            return id
        })
    // return promise of waiting in queue followed by proc
    return poolQueue[id].then(_ => {
            pool[id] = f().then(res => {
                delete pool[id]
                return res
            });
            return pool[id]
        });
}

var getEl = function (q, c) {
    if (!q) return;
    return (c || document).querySelector(q);
};

var getEls = function (q, c) {
    return [].slice.call((c || document).querySelectorAll(q));
};

var toStyleStr = function (obj, selector) {
    let stack = [],
        key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            stack.push(key + ':' + obj[key]);
        }
    }
    if (selector) {
        return selector + '{' + stack.join(';') + '}';
    } else {
        return stack.join(';');
    }
};

var padNumber = function (number, width, pad) {
    pad = pad || '0';
    number = number + '';
    return number.length >= width ? number : new Array(width - number.length + 1).join(pad) + number;
}

var createButton = function (text, action, styleStr) {
    let button = document.createElement('button');
    button.textContent = text;
    button.onclick = action;
    button.setAttribute('style', styleStr || '');
    return button;
};

var createPageBox = function(url, name, inZip){
    let buttonStyleStr = toStyleStr({
        'padding': '5px',
        'margin': '0 10px 10px 0',
    });
    let pageStyleStr = toStyleStr({
        'background-color': 'red',
    },'.ml-page-error')
    +toStyleStr({
        'background-color': 'gray',
    },'.ml-page-queue')
    +toStyleStr({
        'background-color': 'gray',
    },'.ml-page-fetch');

    let pageBox = document.createElement('tr');
    pageBox.className = 'ml-page-ready'

    let msgText = document.createElement('a');
    msgText.textContent = name;
    msgText.href = url
    let msgTextCol = document.createElement('td');
    msgTextCol.appendChild(msgText);

    let msgTextErr = document.createElement('td');
    msgTextErr.textContent = '[Ready]';
    msgTextErr.title = '';

    let action = function (evt) {
        pageBox.className = 'ml-page-queue'
        msgTextErr.textContent = '[Queue]';
        msgTextErr.title = ''
        addToPool(name, () => {
            pageBox.className = 'ml-page-fetch'
            msgTextErr.textContent = '[Fetch]';
            msgTextErr.title = ''
            return fetch(url).then(response => {
                if (response.status === 200 || response.status === 0) {
                    return Promise.resolve(response.blob());
                } else {
                    return Promise.reject(new Error(response.statusText));
                }
            })
            .then(blob => {
                if (pageBox.className != 'ml-page-done') {
                    pageBox.className = 'ml-page-done'
                    msgTextErr.textContent = '[Done]';
                    msgTextErr.title = ''
                    inZip.file(
                        name,
                        blob,
                    );
                }
            })
            .catch(err => {
                if (pageBox.className != 'ml-page-done') {
                    pageBox.className = 'ml-page-error'
                    msgTextErr.textContent = '[Error]';
                    msgTextErr.title = err
                }
            })
        })

    };

    let retryButton = createButton('Retry', action, buttonStyleStr)
    retryButton.className = 'ml-button-retry'
    let buttonCol = document.createElement('td');
    buttonCol.appendChild(retryButton);

    let styleEle = document.createElement('style');
    styleEle.textContent = pageStyleStr;

    pageBox.appendChild(styleEle);
    pageBox.appendChild(msgTextCol);
    pageBox.appendChild(msgTextErr);
    pageBox.appendChild(buttonCol);

    action(null)

    return pageBox
}

var addPages = function(startNum, endNum, nameTemplate, urlText, box, inZip){
    let urls = urlText.split('\n')
    const padI = String(endNum).length;
    const padIdx = String(urls.length).length;
    for (let i = startNum; i <= endNum; i++){
        urls.forEach((url,idx) => {
            let tpI = padNumber(i, padI),
                tpIdx = padNumber(idx+1, padIdx);
            url = url.replace('[[[number]]]',tpI);
            let filename = nameTemplate;
            filename = nameTemplate.replace('[[[number]]]',tpI);
            filename = filename.replace('[[[index]]]',tpIdx);
            let pageBox = createPageBox(url, filename, inZip);
            box.appendChild(pageBox);
        })
    }
}

var autoUpdatePageStats = function(box, stats){
    console.log('Start Timer');
    let intervalId = setInterval(function () {
        let pageDone = getEls('.ml-page-done', box);
        let pageFail = getEls('.ml-page-error', box);
        let pageQueue = getEls('.ml-page-queue', box);
        let pageFetch = getEls('.ml-page-fetch', box);
        let inProc = pageQueue.length+pageFetch.length
        stats.textContent = 
            pageDone.length + ' Done / '+
            pageFail.length + ' Fail / '+
            inProc+' Queue\'d';
        if (inProc <= 0) {
            console.log('Timer Finished');
            clearInterval(intervalId);
        }
    }, 500);
}

var downloadZIP = function (inZip, updatePercent) {
    var lastMetaTime = 0;
    var onProgress = function (meta) {
        // meta update function will be called nearly every 1ms, for performance, update every 300ms
        // anyway it's still too fast so that you may still cannot see the update
        var thisMetaTime = Date.now();
        if (thisMetaTime - lastMetaTime < 300) {
            return;
        }
        lastMetaTime = thisMetaTime;
        updatePercent(meta.percent)
        // console.log("Percent: ", meta.percent)
    };
    return inZip.generateAsync({ type: "blob" }, onProgress)
        .then(blob => {
            saveAs(blob, document.title+".zip")
            // let link = document.createElement('a');
            // link.download = "download.zip";
            // link.href = URL.createObjectURL(blob);
            // link.click();
        });
};

var initBatchDownload = function(){
    let boxStyleStr = toStyleStr({
        'bottom': '40px',
        'right': '0',
        'border-bottom-left-radius': '5px',
        'text-align': 'left',
        'font': 'inherit',
        'max-width': '95%',
        'z-index': '101',
        'white-space': 'pre-wrap',
        'position': 'fixed',
        'background-color': '#222',
        'color': 'white',
        'padding': '7px',
        'border-top-left-radius': '5px',
        'display': 'none',
        'cursor': 'default'
    }),
    buttonStyleStr = toStyleStr({
        'padding': '5px',
        'margin': '0 10px 10px 0',
    }),
    textStyleStr = toStyleStr({
        'max-height': '100px',
    }),
    pagesStyleStr = toStyleStr({
        'max-height': '150px',
        'overflow': 'scroll',
        // 'background-color': 'gray',
    });
    // create main box
    let batchBox = document.createElement('pre');
    batchBox.className = 'ml-floating-box';
    batchBox.setAttribute('style', boxStyleStr || '');
    // create startNum, endNum slider
    let sliderStartNum = document.createElement('input');
    sliderStartNum.className = 'in-slider-start';
    sliderStartNum.size = '5';
    sliderStartNum.type = 'number';
    sliderStartNum.placeholder = 'start';
    // sliderStartNum.value = '0';
    let sliderEndNum = document.createElement('input');
    sliderEndNum.className = 'in-slider-end';
    sliderEndNum.type = 'number';
    sliderEndNum.placeholder = 'end';
    sliderEndNum.size = '5';
    // sliderStartNum.value = '0';
    // create textbox nameTemplate
    let inputNameTemplate = document.createElement('input');
    inputNameTemplate.className = 'in-name';
    // inputNameTemplate.size = '3';
    inputNameTemplate.type = 'text';
    inputNameTemplate.value = '[[[number]]]_[[[index]]].jpg';
    inputNameTemplate.placeholder = 'filename';
    // create textbox big urls
    let inputUrls = document.createElement('textarea');
    inputUrls.className = 'in-url';
    inputUrls.type = 'text';
    inputUrls.setAttribute('style', textStyleStr || '');
    // create pagebox container
    let pageBoxContainer = document.createElement('div'),
        pageTable = document.createElement('table'),
        pageTbody = document.createElement('tbody');
    pageBoxContainer.appendChild(pageTable);
    pageTable.appendChild(pageTbody);
    pageBoxContainer.setAttribute('style', pagesStyleStr || '');
    // create page dl status text
    let pageStatsText = document.createElement('div');
    pageStatsText.className = 'ml-floating-text';
    pageStatsText.textContent = '0 Done / 0 Fail / 0 Queue\'d';
    // create retry all button
    let retryFailButton = createButton('Retry Fail', function (evt) {
        let pageFailButton = getEls('.ml-page-error .ml-button-retry', pageTbody);
        console.log('Retry ',pageFailButton.length,' Failed Pages');
        pageFailButton.forEach(pageButton => {
            pageButton.click()
        })
        // restart timer for download status
        autoUpdatePageStats(pageTbody, pageStatsText)
    }, buttonStyleStr);
    // init zipFile
    let zipFile = new JSZip();
    // create fetch button
    let fetchButton = createButton('Fetch', function (evt) {
        let startNum = sliderStartNum.valueAsNumber,
            endNum = sliderEndNum.valueAsNumber,
            nameTemplate = inputNameTemplate.value,
            urls = inputUrls.value;
        console.log("Fetch Started");
        addPages(startNum, endNum, nameTemplate, urls, pageTbody, zipFile)
        // start timer for download status
        autoUpdatePageStats(pageTbody, pageStatsText)
    }, buttonStyleStr);
    // create download button
    let downloadButton = createButton('Download', function (evt) {
        console.log("Download");
        let updateProgress = function (percent) {};
        downloadZIP(zipFile, updateProgress).then(() => {
            console.log("ZIP Created");
        });
    }, buttonStyleStr);

    batchBox.appendChild(pageStatsText);
    batchBox.appendChild(document.createTextNode(' '))
    batchBox.appendChild(retryFailButton);

    batchBox.appendChild(pageBoxContainer);

    batchBox.appendChild(document.createElement('br'))
    batchBox.appendChild(sliderStartNum);
    batchBox.appendChild(document.createTextNode(' '))
    batchBox.appendChild(sliderEndNum);
    batchBox.appendChild(document.createElement('br'))
    batchBox.appendChild(document.createTextNode('Filename:'))
    batchBox.appendChild(inputNameTemplate);
    batchBox.appendChild(document.createElement('br'))
    batchBox.appendChild(document.createTextNode('URLs:'))
    batchBox.appendChild(document.createElement('br'))
    batchBox.appendChild(inputUrls);
    batchBox.appendChild(document.createElement('br'))

    batchBox.appendChild(fetchButton);
    batchBox.appendChild(document.createTextNode(' '))
    batchBox.appendChild(downloadButton);
    return batchBox;
}

var init = function () {
    let btnLoadCss = toStyleStr({
        'position': 'fixed',
        'bottom': '16px',
        'right': 0,
        'padding': '5px',
        'margin': '0 10px 10px 0',
        'z-index': '9999999999'
    });
    let floatMsg = initBatchDownload(),
        btnLoad = createButton('Load', function (evt) {
            console.log('Load');
            floatMsg.style.display = floatMsg.style.display && floatMsg.style.display == 'none' ? '' : 'none';
        }, btnLoadCss);
    document.body.appendChild(btnLoad);
    document.body.appendChild(floatMsg);
};

// setTimeout(init, 1000)
var intervalId = setInterval(function () {
    if (getEl(waitForElement)) {
        console.log('Condition fulfilled, loading');
        clearInterval(intervalId);
        init();
    } else {
        console.log('Condition not fulfilled');
    }
}, 200);
