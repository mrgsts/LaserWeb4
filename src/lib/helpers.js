
import objectToString from 'object-to-string';

export function sendAsFile(filename, data, mimetype) {
        let blob = new Blob([data], {type: mimetype});

        let tempLink = document.createElement('a');
            tempLink.href = window.URL.createObjectURL(blob);
            tempLink.setAttribute('download', filename);
            tempLink.click();
}

export function appendExt(filename, ext) {
    return (!filename.match(new RegExp(ext.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')+"$",'gi'))) ? (filename+ext):filename;
}

export function openDataWindow(data, mimetype='text/plain;charset=utf-8', target="data")
{
        let blob = new Blob([data], {type: mimetype});
        let reader = new FileReader();
            reader.onloadend = function(e) {
                window.open(reader.result,target);
            }
            reader.readAsDataURL(blob);
}

export function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item) && item !== null);
}

export function deepMerge(target, source) {
  let output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

export function getDescendantProp(obj, desc) {
    var arr = desc.split(".");
    while(arr.length && (obj = obj[arr.shift()]));
    return obj;
}

export function cast(value, def = '') {
    if (value === undefined) return def;
    if (value === false) return "No";
    if (value === true) return "Yes";
    if (isObject(value)) return objectToString(value);
    return String(value);
}

export function clamp(num, min, max) {
  return num <= min ? min : num >= max ? max : num;
}


export const captureConsole = () => {
  
  window.__capture=window.console;
  let captures=[];
  
  window.console = {
    log(...args){
      captures.push({method:"log",args})
    },

    warn(...args){
      captures.push({method:"warn",args})
    },

    error(...args){
      captures.push({method:"error",args})
    },

    info(...args){
      captures.push({method:"info",args})
    }
  }

  return (keys=[])=>{
    window.console = window.__capture;
    if (keys === true) keys=['log','warn','error','info']
    if (keys.length){
      
      captures.forEach(item => {
        if (keys.includes(item.method)) {
          window.console[item.method].apply(null, item.args) 
        }
      })
    }

    return captures;
  }

}

export const strtr=(str,reps)=>{
  Object.entries(reps).forEach((entry)=>{
      str=str.replace(entry[0],entry[1])
  })
  return str;
}

/**
 * Compute the machine origin position and axis directions from settings.
 * Used to convert WebGL workspace coordinates back to machine coordinates for GCode generation.
 * 
 * For a given origin corner, the transform is:
 *   machineX = (webglX - ox) * xDir
 *   machineY = (webglY - oy) * yDir
 *
 * @param {object} settings - Redux settings state
 * @returns {{ ox, oy, xDir, yDir }}
 */
export function getMachineOriginFromSettings(settings) {
    let machineOrigin = settings.machineOrigin || 'BL';
    let machineBottomLeftX = settings.machineBottomLeftX || 0;
    let machineBottomLeftY = settings.machineBottomLeftY || 0;
    let machineWidth = settings.machineWidth || 0;
    let machineHeight = settings.machineHeight || 0;
    let invertX = settings.machineOriginInvertX || false;
    let invertY = settings.machineOriginInvertY || false;
    let ox, oy, xDir, yDir;
    switch (machineOrigin) {
        case 'TL': ox = machineBottomLeftX; oy = machineBottomLeftY + machineHeight; xDir = 1; yDir = -1; break;
        case 'TR': ox = machineBottomLeftX + machineWidth; oy = machineBottomLeftY + machineHeight; xDir = -1; yDir = -1; break;
        case 'BR': ox = machineBottomLeftX + machineWidth; oy = machineBottomLeftY; xDir = -1; yDir = 1; break;
        case 'BL': default: ox = machineBottomLeftX; oy = machineBottomLeftY; xDir = 1; yDir = 1; break;
    }
    if (invertX) xDir *= -1;
    if (invertY) yDir *= -1;
    return { ox, oy, xDir, yDir };
}