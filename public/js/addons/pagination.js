!function(e){var t;jQuery&&jQuery.UIkit&&(t=e(jQuery,jQuery.UIkit)),"function"==typeof define&&define.amd&&define("uikit-pagination",["uikit"],function(){return t||e(jQuery,jQuery.UIkit)})}(function(e,t){"use strict";return t.component("pagination",{defaults:{items:1,itemsOnPage:1,pages:0,displayedPages:3,edges:3,currentPage:1,lblPrev:!1,lblNext:!1,onSelectPage:function(){}},init:function(){var t=this;this.pages=this.options.pages?this.options.pages:Math.ceil(this.options.items/this.options.itemsOnPage)?Math.ceil(this.options.items/this.options.itemsOnPage):1,this.currentPage=this.options.currentPage-1,this.halfDisplayed=this.options.displayedPages/2,this.on("click","a[data-page]",function(i){i.preventDefault(),t.selectPage(e(this).data("page"))}),this._render()},_getInterval:function(){return{start:Math.ceil(this.currentPage>this.halfDisplayed?Math.max(Math.min(this.currentPage-this.halfDisplayed,this.pages-this.options.displayedPages),0):0),end:Math.ceil(this.currentPage>this.halfDisplayed?Math.min(this.currentPage+this.halfDisplayed,this.pages):Math.min(this.options.displayedPages,this.pages))}},render:function(e){this.pages=e?e:this.pages,this._render()},selectPage:function(e,t){this.currentPage=e,this.render(t),this.options.onSelectPage.apply(this,[e]),this.trigger("uk-select-page",[e,this])},_render:function(){var e,t=this.options,i=this._getInterval();if(this.element.empty(),t.lblPrev&&this._append(t.currentPage-1,{text:t.lblPrev}),i.start>0&&t.edges>0){var s=Math.min(t.edges,i.start);for(e=0;s>e;e++)this._append(e);t.edges<i.start&&i.start-t.edges!=1?this.element.append("<li><span>...</span></li>"):i.start-t.edges==1&&this._append(t.edges)}for(e=i.start;e<i.end;e++)this._append(e);if(i.end<this.pages&&t.edges>0){this.pages-t.edges>i.end&&this.pages-t.edges-i.end!=1?this.element.append("<li><span>...</span></li>"):this.pages-t.edges-i.end==1&&this._append(i.end++);var a=Math.max(this.pages-t.edges,i.end);for(e=a;e<this.pages;e++)this._append(e)}t.lblNext&&this._append(t.currentPage+1,{text:t.lblNext})},_append:function(t,i){var s,a;t=0>t?0:t<this.pages?t:this.pages-1,a=e.extend({text:t+1},i),s=t==this.currentPage?'<li class="uk-active"><span>'+a.text+"</span></li>":'<li><a href="#page-'+(t+1)+'" data-page="'+t+'">'+a.text+"</a></li>",this.element.append(s)}}),t.ready(function(i){e("[data-uk-pagination]",i).each(function(){var i=e(this);if(!i.data("pagination")){t.pagination(i,t.Utils.options(i.attr("data-uk-pagination")))}})}),t.pagination});