$(document).ready(function() {
  sample();
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
  var grid;
  //var loader = new Slick.Data.RemoteModel();
  var columns = [
    {id: "title", name: "Title", field: "title", sortable: true},
    {id: "duration", name: "Duration", field: "duration", sortable: true},
    {id: "%", name: "% Complete", field: "percentComplete", sortable: true},
    {id: "start", name: "Start", field: "start", sortable: true},
    {id: "finish", name: "Finish", field: "finish", sortable: true},
    {id: "effort-driven", name: "Effort Driven", field: "effortDriven", sortable: true}
  ];
  var options = {
    enableCellNavigation: true,
    enableColumnReorder: false,
    multiColumnSort: true
  };

  var loadingIndicator = null;

  $.ajax({
    url: '/data',
    dataType: "json",
    error: function (jqXHR, textStatus, errorThrown) {
      alert("hi this is error message");
      console.log(jqXHR);
    },
    success: function (data) {
      for (var i = 0; i < data.length; i++) {
        data[i] = {
          title: data[i].title,
          duration: data[i].duration,
          percentComplete: data[i].percentComplete,
          start: data[i].start,
          finish: data[i].finish,
          effortDriven: data[i].effortDriven
        }
      }
      grid = new Slick.Grid("#coupons", data, columns, options);
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
});