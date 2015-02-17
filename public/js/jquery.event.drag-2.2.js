!function(t){t.fn.drag=function(e,a,n){var r="string"==typeof e?e:"",o=t.isFunction(e)?e:t.isFunction(a)?a:null;return 0!==r.indexOf("drag")&&(r="drag"+r),n=(e==o?a:n)||{},o?this.bind(r,n,o):this.trigger(r)};var e=t.event,a=e.special,n=a.drag={defaults:{which:1,distance:0,not:":input",handle:null,relative:!1,drop:!0,click:!1},datakey:"dragdata",noBubble:!0,add:function(e){var a=t.data(this,n.datakey),r=e.data||{};a.related+=1,t.each(n.defaults,function(t){void 0!==r[t]&&(a[t]=r[t])})},remove:function(){t.data(this,n.datakey).related-=1},setup:function(){if(!t.data(this,n.datakey)){var a=t.extend({related:0},n.defaults);t.data(this,n.datakey,a),e.add(this,"touchstart mousedown",n.init,a),this.attachEvent&&this.attachEvent("ondragstart",n.dontstart)}},teardown:function(){var a=t.data(this,n.datakey)||{};a.related||(t.removeData(this,n.datakey),e.remove(this,"touchstart mousedown",n.init),n.textselect(!0),this.detachEvent&&this.detachEvent("ondragstart",n.dontstart))},init:function(r){if(!n.touched){var o,i=r.data;if(!(0!=r.which&&i.which>0&&r.which!=i.which||t(r.target).is(i.not)||i.handle&&!t(r.target).closest(i.handle,r.currentTarget).length||(n.touched="touchstart"==r.type?this:null,i.propagates=1,i.mousedown=this,i.interactions=[n.interaction(this,i)],i.target=r.target,i.pageX=r.pageX,i.pageY=r.pageY,i.dragging=null,o=n.hijack(r,"draginit",i),!i.propagates)))return o=n.flatten(o),o&&o.length&&(i.interactions=[],t.each(o,function(){i.interactions.push(n.interaction(this,i))})),i.propagates=i.interactions.length,i.drop!==!1&&a.drop&&a.drop.handler(r,i),n.textselect(!1),n.touched?e.add(n.touched,"touchmove touchend",n.handler,i):e.add(document,"mousemove mouseup",n.handler,i),!n.touched||i.live?!1:void 0}},interaction:function(e,a){var r=t(e)[a.relative?"position":"offset"]()||{top:0,left:0};return{drag:e,callback:new n.callback,droppable:[],offset:r}},handler:function(r){var o=r.data;switch(r.type){case!o.dragging&&"touchmove":r.preventDefault();case!o.dragging&&"mousemove":if(Math.pow(r.pageX-o.pageX,2)+Math.pow(r.pageY-o.pageY,2)<Math.pow(o.distance,2))break;r.target=o.target,n.hijack(r,"dragstart",o),o.propagates&&(o.dragging=!0);case"touchmove":r.preventDefault();case"mousemove":if(o.dragging){if(n.hijack(r,"drag",o),o.propagates){o.drop!==!1&&a.drop&&a.drop.handler(r,o);break}r.type="mouseup"}case"touchend":case"mouseup":default:n.touched?e.remove(n.touched,"touchmove touchend",n.handler):e.remove(document,"mousemove mouseup",n.handler),o.dragging&&(o.drop!==!1&&a.drop&&a.drop.handler(r,o),n.hijack(r,"dragend",o)),n.textselect(!0),o.click===!1&&o.dragging&&t.data(o.mousedown,"suppress.click",(new Date).getTime()+5),o.dragging=n.touched=!1}},hijack:function(a,r,o,i,d){if(o){var s,c,l,u={event:a.originalEvent,type:a.type},p=r.indexOf("drop")?"drag":"drop",h=i||0,g=isNaN(i)?o.interactions.length:i;a.type=r,a.originalEvent=null,o.results=[];do if(c=o.interactions[h]){if("dragend"!==r&&c.cancelled)continue;l=n.properties(a,o,c),c.results=[],t(d||c[p]||o.droppable).each(function(i,d){return l.target=d,a.isPropagationStopped=function(){return!1},s=d?e.dispatch.call(d,a,l):null,s===!1?("drag"==p&&(c.cancelled=!0,o.propagates-=1),"drop"==r&&(c[p][i]=null)):"dropinit"==r&&c.droppable.push(n.element(s)||d),"dragstart"==r&&(c.proxy=t(n.element(s)||c.drag)[0]),c.results.push(s),delete a.result,"dropinit"!==r?s:void 0}),o.results[h]=n.flatten(c.results),"dropinit"==r&&(c.droppable=n.flatten(c.droppable)),"dragstart"!=r||c.cancelled||l.update()}while(++h<g);return a.type=u.type,a.originalEvent=u.event,n.flatten(o.results)}},properties:function(t,e,a){var r=a.callback;return r.drag=a.drag,r.proxy=a.proxy||a.drag,r.startX=e.pageX,r.startY=e.pageY,r.deltaX=t.pageX-e.pageX,r.deltaY=t.pageY-e.pageY,r.originalX=a.offset.left,r.originalY=a.offset.top,r.offsetX=r.originalX+r.deltaX,r.offsetY=r.originalY+r.deltaY,r.drop=n.flatten((a.drop||[]).slice()),r.available=n.flatten((a.droppable||[]).slice()),r},element:function(t){return t&&(t.jquery||1==t.nodeType)?t:void 0},flatten:function(e){return t.map(e,function(e){return e&&e.jquery?t.makeArray(e):e&&e.length?n.flatten(e):e})},textselect:function(e){t(document)[e?"unbind":"bind"]("selectstart",n.dontstart).css("MozUserSelect",e?"":"none"),document.unselectable=e?"off":"on"},dontstart:function(){return!1},callback:function(){}};n.callback.prototype={update:function(){a.drop&&this.available.length&&t.each(this.available,function(t){a.drop.locate(this,t)})}};var r=e.dispatch;e.dispatch=function(e){return t.data(this,"suppress."+e.type)-(new Date).getTime()>0?(t.removeData(this,"suppress."+e.type),void 0):r.apply(this,arguments)};var o=e.fixHooks.touchstart=e.fixHooks.touchmove=e.fixHooks.touchend=e.fixHooks.touchcancel={props:"clientX clientY pageX pageY screenX screenY".split(" "),filter:function(e,a){if(a){var n=a.touches&&a.touches[0]||a.changedTouches&&a.changedTouches[0]||null;n&&t.each(o.props,function(t,a){e[a]=n[a]})}return e}};a.draginit=a.dragstart=a.dragend=n}(jQuery);
//# sourceMappingURL=/js/maps/jquery.event.drag-2.2.js.map