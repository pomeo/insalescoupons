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
});