!function(e){var t;jQuery&&jQuery.UIkit&&(t=e(jQuery,jQuery.UIkit)),"function"==typeof define&&define.amd&&define("uikit-upload",["uikit"],function(){return t||e(jQuery,jQuery.UIkit)})}(function(e,t){function n(a,r){function i(t,n){var o=new FormData,a=new XMLHttpRequest;if(n.before(n,t)!==!1){for(var r,i=0;r=t[i];i++)o.append(n.param,r);for(var l in n.params)o.append(l,n.params[l]);a.upload.addEventListener("progress",function(e){var t=e.loaded/e.total*100;n.progress(t,e)},!1),a.addEventListener("loadstart",function(e){n.loadstart(e)},!1),a.addEventListener("load",function(e){n.load(e)},!1),a.addEventListener("loadend",function(e){n.loadend(e)},!1),a.addEventListener("error",function(e){n.error(e)},!1),a.addEventListener("abort",function(e){n.abort(e)},!1),a.open(n.method,n.action,!0),a.onreadystatechange=function(){if(n.readystatechange(a),4==a.readyState){var t=a.responseText;if("json"==n.type)try{t=e.parseJSON(t)}catch(o){t=!1}n.complete(t,a)}},n.beforeSend(a),a.send(o)}}if(!t.support.ajaxupload)return this;if(r=e.extend({},n.defaults,r),a.length){if("*.*"!==r.allow)for(var l,f=0;l=a[f];f++)if(!o(r.allow,l.name))return"string"==typeof r.notallowed?alert(r.notallowed):r.notallowed(l,r),void 0;var u=r.complete;if(r.single){var s=a.length,d=0,p=!0;r.beforeAll(a),r.complete=function(e,t){d+=1,u(e,t),r.filelimit&&d>=r.filelimit&&(p=!1),p&&s>d?i([a[d]],r):r.allcomplete(e,t)},i([a[0]],r)}else r.complete=function(e,t){u(e,t),r.allcomplete(e,t)},i(a,r)}}function o(e,t){var n="^"+e.replace(/\//g,"\\/").replace(/\*\*/g,"(\\/[^\\/]+)*").replace(/\*/g,"[^\\/]+").replace(/((?!\\))\?/g,"$1.")+"$";return n="^"+n+"$",null!==t.match(new RegExp(n,"i"))}return t.component("uploadSelect",{init:function(){var e=this;this.on("change",function(){n(e.element[0].files,e.options)})}}),t.component("uploadDrop",{defaults:{dragoverClass:"uk-dragover"},init:function(){var e=this,t=!1;this.on("drop",function(t){t.dataTransfer&&t.dataTransfer.files&&(t.stopPropagation(),t.preventDefault(),e.element.removeClass(e.options.dragoverClass),e.element.trigger("uk.dropped",[t.dataTransfer.files]),n(t.dataTransfer.files,e.options))}).on("dragenter",function(e){e.stopPropagation(),e.preventDefault()}).on("dragover",function(n){n.stopPropagation(),n.preventDefault(),t||(e.element.addClass(e.options.dragoverClass),t=!0)}).on("dragleave",function(n){n.stopPropagation(),n.preventDefault(),e.element.removeClass(e.options.dragoverClass),t=!1})}}),t.support.ajaxupload=function(){function e(){var e=document.createElement("INPUT");return e.type="file","files"in e}function t(){var e=new XMLHttpRequest;return!!(e&&"upload"in e&&"onprogress"in e.upload)}function n(){return!!window.FormData}return e()&&t()&&n()}(),t.support.ajaxupload&&e.event.props.push("dataTransfer"),n.defaults={action:"",single:!0,method:"POST",param:"files[]",params:{},allow:"*.*",type:"text",filelimit:!1,before:function(){},beforeSend:function(){},beforeAll:function(){},loadstart:function(){},load:function(){},loadend:function(){},error:function(){},abort:function(){},progress:function(){},complete:function(){},allcomplete:function(){},readystatechange:function(){},notallowed:function(e,t){alert("Only the following file types are allowed: "+t.allow)}},t.Utils.xhrupload=n,n});
//# sourceMappingURL=/js//maps/addons/upload.js.map