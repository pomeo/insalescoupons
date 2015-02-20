$(document).ready(function() {
  if ($("#coupons").length !== 0) {
    sample();
  }
  $.validator.addMethod('loginRegex', function(value, element) {
    return this.optional(element) || /^[a-zA-Zа-яА-Я0-9\-]+$/i.test(value);
  }, 'Только цифры, буквы и дефис');
  $('#coupons-generate').validate({
    errorClass: 'uk-form-danger',
    validClass: 'uk-form-success',
    highlight: function(element, errorClass, validClass) {
      $(element).addClass(errorClass).removeClass(validClass);
    },
    unhighlight: function(element, errorClass, validClass) {
      $(element).removeClass(errorClass).addClass(validClass);
    },
    rules: {
      'c-num': {
        required: true,
        range: [1, 10000]
      },
      'c-part': {
        required: true,
        range: [1, 5]
      },
      'c-partlen': {
        required: true,
        range: [4, 10]
      },
      discount: {
        required: true
      },
      until: {
        required: true,
        dateNL: true
      },
      group: {
        loginRegex: true
      }
    },
    submitHandler: function(form) {
      $(form).ajaxSubmit({
        success: function (response) {
          if (response == 'success') {
            $.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.", {status:'success'})
          } else {
            $.UIkit.notify("ошибка", {status:'danger'});
          }
        }
      });
      return false;
    }
  })
  $("#coupons-delete").submit(function() {
    $(this).ajaxSubmit({
      success: function (response) {
        if (response == 'success') {
          $.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.", {status:'success'})
        } else {
          $.UIkit.notify("ошибка", {status:'danger'});
        }
      }
    });
    return false;
  });
  $("#button-sync").click(function() {
    $.ajax({
      type: "POST",
      url: "/input",
      data: { data: 1 }
    })
    .done(function(response) {
      if (response == "success") {
        $.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.", {status:'success'})
      } else {
        $.UIkit.notify("ошибка", {status:'danger'});
      }
    });
  });
  $("#button-export").click(function() {
    $.ajax({
      type: "POST",
      url: "/input",
      data: { data: 2 }
    })
    .done(function(response) {
      if (response == "success") {
        $.UIkit.notify("<i class='uk-icon-check'></i> Отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.", {status:'success'})
      } else {
        $.UIkit.notify("ошибка", {status:'danger'});
      }
    });
  });
  $("input[name='c-part'], input[name='c-partlen']").change(sample);
  function sample() {
    var n = $("input[name='c-num']").val();
    var p = $("input[name='c-part']").val();
    var l = $("input[name='c-partlen']").val();
    $.getJSON( "/sample", { number: n, parts: p, length: l }, function(data) {
      $("#coupon-sample").html(data);
    });
  };
  $("select[name='typediscount']").change(function() {
    if ($("select[name='typediscount']").val() == 1) {
      $(".uk-icon-percent").remove();
      $(".uk-icon-rub").remove();
      $("#b-discount").prepend("<i class='uk-icon-percent'></i>");
    } else {
      $(".uk-icon-percent").remove();
      $(".uk-icon-rub").remove();
      $("#b-discount").prepend("<i class='uk-icon-rub'></i>");
    }
  });
  if ($("#coupons").length !== 0) {
    var grid;
    var columns = [
      {id: "code", name: "Код купона", field: "code", sortable: true},
      {id: "type", name: "Тип", field: "type", sortable: true},
      {id: "coll", name: "Категории", field: "coll", sortable: true},
      {id: "disc", name: "Скидка", field: "disc", sortable: true},
      {id: "expired", name: "Действителен по", field: "expired", sortable: true},
      {id: "disabled", name: "Заблокирован", field: "disabled", sortable: true},
      {id: "worked", name: "Использован", field: "worked", sortable: true}
    ];
    var options = {
      enableCellNavigation: true,
      enableColumnReorder: false,
      syncColumnCellResize: true,
      multiColumnSort: true,
      forceFitColumns: true
    };

    var loadingIndicator = null;
    if (!loadingIndicator) {
      loadingIndicator = $("<span class='loading-indicator'><img src='/img/tail-spin.svg' />Загрузка купонов</span>").appendTo(document.body);
      var $g = $("#coupons");
      loadingIndicator
      .css("display", "none")
      .css("position", "absolute")
      .css("top", $g.position().top + $g.height() / 2 - loadingIndicator.height() / 2)
      .css("left", $g.position().left + $g.width() / 2 - loadingIndicator.width() / 2);
    }
    loadingIndicator.fadeIn();

    $.ajax({
      url: '/data',
      dataType: "json",
      error: function (jqXHR, textStatus, errorThrown) {
        loadingIndicator.html("<span class='loading-indicator'>Ошибка загрузки купонов<br />попробуйте обновить страницу</span>");
      },
      success: function(data) {
        $("#b-coupon-sum").html(data.length);
        for (var i = 0; i < data.length; i++) {
          data[i] = {
            code: data[i].code,
            type: data[i].type,
            coll: data[i].coll,
            disc: data[i].disc,
            expired: data[i].expired,
            disabled: data[i].disabled,
            worked: data[i].worked
          }
        }
        grid = new Slick.Grid("#coupons", data, columns, options);
        if (data.length == 0) {
          loadingIndicator.html("<span class='loading-indicator'>Купоны отсутствуют<br />в базе приложения</span>");
        } else {
          loadingIndicator.fadeOut();
        }
        grid.onSort.subscribe(function (e, args) {
          var cols = args.sortCols;
          data.sort(function (dataRow1, dataRow2) {
            for (var i = 0, l = cols.length; i < l; i++) {
              var field = cols[i].sortCol.field;
              var sign = cols[i].sortAsc ? 1 : -1;
              var value1 = dataRow1[field], value2 = dataRow2[field];
              var result = (value1 == value2 ? 0 : (value1 > value2 ? 1 : -1)) * sign;
              if (result != 0) {
                return result;
              }
            }
            return 0;
          });
          grid.invalidate();
          grid.render();
        });
      }
    });
  }
  if ($("#progressbar")) {
    var progressbar = $("#progressbar"),
        bar         = progressbar.find('.uk-progress-bar'),
        settings    = {
          action: '/import',
          allow : '*.(xlsx)',
          loadstart: function() {
            bar.css("width", "0%").text("0%");
            progressbar.removeClass("uk-hidden");
          },
          progress: function(percent) {
            percent = Math.ceil(percent);
            bar.css("width", percent+"%").text(percent+"%");
          },
          allcomplete: function(response) {
            bar.css("width", "100%").text("100%");
            setTimeout(function(){
              progressbar.addClass("uk-hidden");
            }, 250);
            $.UIkit.notify("<i class='uk-icon-check'></i> Успешно загружено и отправлено в очередь на выполнение.<br />Состояние можно посмотреть на странице <a href='/zadaniya'>&laquo;Задания&raquo;</a>.", {status:'success'})
          }
        };
    var select = $.UIkit.uploadSelect($("#upload-select"), settings),
        drop   = $.UIkit.uploadDrop($("#upload-drop"), settings);
  }
});