// ==UserScript==
// @name        Canvas Downloader
// @description Download all image in a page
// @version     0.1.0
// @include     *://?
// @grant       none
// @require     https://raw.githubusercontent.com/Stuk/jszip/v3.1.5/dist/jszip.min.js
// @require     https://raw.githubusercontent.com/eligrey/FileSaver.js/master/dist/FileSaver.min.js
// @require     https://raw.githubusercontent.com/eligrey/canvas-toBlob.js/master/canvas-toBlob.js
// @require     https://raw.githubusercontent.com/eligrey/Blob.js/master/Blob.js
// ==/UserScript==

var zipFile,
    waitForElement = '#br-main',
    canvasQuery = 'canvas',
    fileType = 'image/png',
    fileNameFormat = '{{number}}.png';

var getEl = function (q, c) {
    if (!q) return;
    return (c || document).querySelector(q);
};

var getEls = function (q, c) {
    return [].slice.call((c || document).querySelectorAll(q));
};

var padNumber = function (number, width, pad) {
    pad = pad || '0';
    number = number + '';
    return number.length >= width ? number : new Array(width - number.length + 1).join(pad) + number;
}

var isCanvasBlank = function (drawCtx, w, h) {
    const pixelBuffer = new Uint32Array(
        drawCtx.getImageData(0, 0, w, h).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
}

var packImage = function (canvases, zipFile) {
    const padW = String(canvases.length).length
    return Array.from(
        { length: canvases.length },
        (x, idx) => {
            let paddedNumber = padNumber(idx + 1, padW),
                fileName = fileNameFormat.replace('{{number}}', paddedNumber);
            if (zipFile.file(fileName)) {
                return { ok: true, msg: "Already added", idx: idx, fileName: fileName }
            }
            console.log('proc ' + fileName);
            let inCanvas = canvases[idx],
                tpCanvas = document.createElement("canvas"),
                tpDrawCtx = tpCanvas.getContext('2d');
            tpCanvas.height = inCanvas.height;
            tpCanvas.width = inCanvas.width;
            try {
                tpDrawCtx.drawImage(inCanvas, 0, 0);
            } catch (e) {
                console.log(e);
                return { ok: false, msg: "Draw Canvas Error", idx: idx, fileName: fileName }
            }
            if (isCanvasBlank(tpDrawCtx, inCanvas.width, inCanvas.height)) {
                return { ok: false, msg: "Blank Canvas", idx: idx, fileName: fileName }
            }
            // let imgUrl = tpCanvas.toDataURL(fileType);
            // zipFile.file(
            //     fileName,
            //     imgUrl.split('base64,')[1],
            //     { base64: true }
            // );
            tpCanvas.toBlob(blob => {
                zipFile.file(
                    fileName,
                    blob
                );
            })
            return { ok: true, msg: "Image added", idx: idx, fileName: fileName }
        });
};

var downloadZIP = function (zipFile, updatePercent) {
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
    return zipFile.generateAsync({ type: "blob" }, onProgress)
        .then(blob => {
            saveAs(blob, document.title+".zip")
            // let link = document.createElement('a');
            // link.download = "download.zip";
            // link.href = URL.createObjectURL(blob);
            // link.click();
        });
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

var createButton = function (text, action, styleStr) {
    let button = document.createElement('button');
    button.textContent = text;
    button.onclick = action;
    button.setAttribute('style', styleStr || '');
    return button;
};

var initFloatMsg = function () {
    let boxStyleStr = toStyleStr({
        'bottom': '100px',
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
            'overflow': 'scroll',
        });

    let floatingMsg = document.createElement('pre');
    floatingMsg.className = 'ml-floating-box';
    floatingMsg.setAttribute('style', boxStyleStr || '');

    let msgText = document.createElement('div');
    msgText.className = 'ml-floating-text';
    msgText.textContent = 'Ready';

    let msgTextErr = document.createElement('div');
    msgTextErr.className = 'ml-floating-textbox';
    msgTextErr.textContent = '';
    msgTextErr.setAttribute('style', textStyleStr || '');

    let packButton = createButton('Pack Image', function (evt) {
        console.log("Pack Image");
        let msgText = getEl('.ml-floating-text'),
            msgTextErr = getEl('.ml-floating-textbox');
        msgText.textContent = "Packing Image";
        msgTextErr.textContent = ''

        let canvases = getEls(canvasQuery);
        let resMsgObj = packImage(canvases, zipFile);

        let resTxt = '' + resMsgObj.filter(msg => msg.ok).length + '/' + resMsgObj.length + ' Page Loaded',
            resErr = resMsgObj.filter(msg => !msg.ok)
                .map(msg => 'Page ' + (msg.idx + 1) + ' Error: ' + msg.msg)
                .join('\n')
        msgText.textContent = resTxt
        msgTextErr.textContent = resErr
    }, buttonStyleStr);

    let downloadButton = createButton('Download', function (evt) {
        console.log("Download");
        let msgText = getEl('.ml-floating-text'),
            msgTextErr = getEl('.ml-floating-textbox'),
            updateProgress = function (percent) {
                msgText.textContent = "Creating ZIP... " + percent.toFixed(2) + "%";
            };
        msgText.textContent = "Creating ZIP...";
        msgTextErr.textContent = Object.keys(zipFile.files).join('\n')
        downloadZIP(zipFile, updateProgress).then(() => {
            msgText.textContent = "ZIP Created";
        });
    }, buttonStyleStr);

    floatingMsg.appendChild(msgTextErr);
    floatingMsg.appendChild(msgText);
    floatingMsg.appendChild(packButton);
    floatingMsg.appendChild(document.createTextNode(' '))
    floatingMsg.appendChild(downloadButton);
    return floatingMsg;
};

var init = function () {
    let btnLoadCss = toStyleStr({
        'position': 'fixed',
        'bottom': '64px',
        'right': 0,
        'padding': '5px',
        'margin': '0 10px 10px 0',
        'z-index': '9999999999'
    });
    let floatMsg = initFloatMsg(),
        btnLoad = createButton('Load', function (evt) {
            console.log('Load');
            floatMsg.style.display = floatMsg.style.display && floatMsg.style.display == 'none' ? '' : 'none';

            zipFile = new JSZip();
            let msgText = getEl('.ml-floating-text'),
                msgTextErr = getEl('.ml-floating-textbox');
            msgText.textContent = "Ready";
            msgTextErr.textContent = ''
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
