!function(t){var e;jQuery&&jQuery.UIkit&&(e=t(jQuery,jQuery.UIkit)),"function"==typeof define&&define.amd&&define("uikit-form-select",["uikit"],function(){return e||t(jQuery,jQuery.UIkit)})}(function(t,e){return e.component("formSelect",{defaults:{target:">span:first"},init:function(){var t=this;this.target=this.find(this.options.target),this.select=this.find("select"),this.select.on("change",function(){var e=t.select[0],i=function(){try{t.target.text(e.options[e.selectedIndex].text)}catch(n){}return i};return i()}()),this.element.data("formSelect",this)}}),e.ready(function(i){t("[data-uk-form-select]",i).each(function(){var i=t(this);if(!i.data("formSelect")){e.formSelect(i,e.Utils.options(i.attr("data-uk-form-select")))}})}),e.formSelect});
//# sourceMappingURL=/js//maps/addons/form-select.js.map