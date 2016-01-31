$(document).ready(function(){function e(){var e=$("input[name='c-num']").val(),t=$("input[name='c-part']").val(),o=$("input[name='c-partlen']").val();$.getJSON("/sample",{number:e,parts:t,length:o},function(e){$("#coupon-sample").html(e)})}if(0!==$("#coupons").length&&e(),$.validator.addMethod("loginRegex",function(e,t){return this.optional(t)||/^[a-zA-Zа-яА-Я0-9\-]+$/i.test(e)},"Только цифры, буквы и дефис"),$("#coupons-generate").validate({errorClass:"uk-form-danger",validClass:"uk-form-success",highlight:function(e,t,o){$(e).addClass(t).removeClass(o)},unhighlight:function(e,t,o){$(e).removeClass(t).addClass(o)},rules:{"c-num":{required:!0,range:[1,1e4]},"c-part":{required:!0,range:[1,5]},"c-partlen":{required:!0,range:[4,10]},discount:{required:!0},until:{required:!0,dateNL:!0},group:{loginRegex:!0}},submitHandler:function(e){return $(e).ajaxSubmit({success:function(e){"success"==e?$.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.",{pos:"bottom-left",timeout:5e3}):$.UIkit.notify("Ошибка",{pos:"bottom-left",timeout:5e3})}}),!1}}),$("#coupons-delete").submit(function(){return $(this).ajaxSubmit({success:function(e){"success"==e?$.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.",{pos:"bottom-left",timeout:5e3}):$.UIkit.notify("Ошибка",{pos:"bottom-left",timeout:5e3})}}),!1}),$("#button-sync").click(function(){$.ajax({type:"POST",url:"/input",data:{data:1}}).success(function(){$.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.",{pos:"bottom-left",timeout:5e3})}).error(function(){$.UIkit.notify("Ошибка",{pos:"bottom-left",timeout:5e3})})}),$("#button-export").click(function(){$.ajax({type:"POST",url:"/input",data:{data:2}}).success(function(){$.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.",{pos:"bottom-left",timeout:5e3})}).error(function(){$.UIkit.notify("Ошибка",{pos:"bottom-left",timeout:5e3})})}),$("input[name='c-part'], input[name='c-partlen']").change(e),$("select[name='typediscount']").change(function(){1==$("select[name='typediscount']").val()?($(".uk-icon-percent").remove(),$(".uk-icon-rub").remove(),$("#b-discount").prepend("<i class='uk-icon-percent'></i>")):($(".uk-icon-percent").remove(),$(".uk-icon-rub").remove(),$("#b-discount").prepend("<i class='uk-icon-rub'></i>"))}),0!==$("#coupons").length){var t,o=[{id:"code",name:"Код купона",field:"code",sortable:!0},{id:"type",name:"Тип",field:"type",sortable:!0},{id:"coll",name:"Категории",field:"coll",sortable:!0},{id:"disc",name:"Скидка",field:"disc",sortable:!0},{id:"expired",name:"Действителен по",field:"expired",sortable:!0},{id:"disabled",name:"Заблокирован",field:"disabled",sortable:!0},{id:"worked",name:"Использован",field:"worked",sortable:!0}],i={enableCellNavigation:!0,enableColumnReorder:!1,syncColumnCellResize:!0,multiColumnSort:!0,forceFitColumns:!0},n=null;if(!n){n=$("<span class='loading-indicator'><img src='/img/tail-spin.svg' />Загрузка купонов</span>").appendTo(document.body);var a=$("#coupons");n.css("display","none").css("position","absolute").css("top",a.position().top+a.height()/2-n.height()/2).css("left",a.position().left+a.width()/2-n.width()/2)}n.fadeIn(),$.ajax({url:"/data",dataType:"json",error:function(e,t,o){n.html("<span class='loading-indicator'>Ошибка загрузки купонов<br />попробуйте обновить страницу</span>")},success:function(e){$("#b-coupon-sum").html(e.length);for(var a=0;a<e.length;a++)e[a]={code:e[a].code,type:e[a].type,coll:e[a].coll,disc:e[a].disc,expired:e[a].expired,disabled:e[a].disabled,worked:e[a].worked};t=new Slick.Grid("#coupons",e,o,i),0==e.length?n.html("<span class='loading-indicator'>Купоны отсутствуют<br />в базе приложения</span>"):n.fadeOut(),t.onSort.subscribe(function(o,i){var n=i.sortCols;e.sort(function(e,t){for(var o=0,i=n.length;i>o;o++){var a=n[o].sortCol.field,s=n[o].sortAsc?1:-1,r=e[a],c=t[a],l=(r==c?0:r>c?1:-1)*s;if(0!=l)return l}return 0}),t.invalidate(),t.render()})}})}if($("#progressbar")){var s=$("#progressbar"),r=s.find(".uk-progress-bar"),c={action:"/import",allow:"*.(xlsx)",loadstart:function(){r.css("width","0%").text("0%"),s.removeClass("uk-hidden")},progress:function(e){e=Math.ceil(e),r.css("width",e+"%").text(e+"%")},allcomplete:function(e){r.css("width","100%").text("100%"),setTimeout(function(){s.addClass("uk-hidden")},250),$.UIkit.notify("<i class='uk-icon-check'></i> Успешно загружено и отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.",{pos:"bottom-left",timeout:5e3})}};$.UIkit.uploadSelect($("#upload-select"),c),$.UIkit.uploadDrop($("#upload-drop"),c)}});
//# sourceMappingURL=/js//maps/app.js.map
