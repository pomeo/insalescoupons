$(document).ready(function() {
  sample();
  $("input[name='c-part'], input[name='c-partlen']").change(sample);
  function sample() {
    var n = $("input[name='c-num']").val();
    var p = $("input[name='c-part']").val();
    var l = $("input[name='c-partlen']").val();
    $.getJSON( "/sample", { number: n, parts: p, length: l }, function(data) {
      $("#coupon-sample").html(data);
    });
  };