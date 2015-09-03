require(['foodlog', 'd3', 'nvd3'], function(FoodLog, d3, nv) {
  var table = document.getElementById('foodlog');
  table.innerHTML = '';

  table.addEventListener('click', function(event) {
    if (!event.target.matches('.summary *')) return;
    event.preventDefault();
    var row = event.target.parentNode.nextSibling;
    while (row && (!row.matches || !row.matches('.summary'))) {
      if (row.matches && row.matches('.detail')) row.classList.toggle('visible');
      row = row.nextSibling;
    }
  });

  function tag(type, parent, text) {
    result = document.createElement(type);
    if (text) result.innerText = text;
    parent.appendChild(result);
    return result;
  }

  function last(array) { return array[array.length - 1]; }
  function template(selector) { return document.importNode(document.querySelector(selector).content, true); }

  function pad(n) { if (n < 10) return '0' + n; return n; }
  function setTimeTag(tag, value, display) {
    var iso = value.getUTCFullYear() + '-' + pad(value.getUTCMonth()) + '-' + pad(value.getUTCDate());
    var local = value.getFullYear() + '-' + pad(value.getMonth()) + '-' + pad(value.getDate());
    if (display == undefined || display == null) display = value.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
    tag.setAttribute('datetime', iso);
    tag.innerText = display;
  }

  function setDataTag(tag, value, display) {
    tag.setAttribute('value', value);
    if (display == undefined || display == null) {
      tag.innerText = value;
    } else {
      tag.innerText = display;
    }
  }

  var zone = (function() {
    var o = new Date().getTimezoneOffset();
    var s = '-';
    if (o < 0) {
      s = '+';
      o = -o;
    }
    var m = o % 60;
    var h = (o - m) / 60;
    return s + pad(h) + ":" + pad(m);
  })();

  function parseDate(s) {
    return new Date(s + "T00:00:00" + zone);
  }

  var accumulateExponentialAverage = (function(alpha) {
    var sum = null;

    return function(entry) {
      if (sum) {
        sum *= (1 - alpha)
        sum += alpha * entry;
        return sum;
      } else {
        sum = entry;
        return sum;
      }
    };
  })(0.2);

  var accumulateMovingAverage = (function(width) {
    var queue = [];
    var sum = 0;

    return function(entry) {
      queue.push(entry);
      sum += entry;
      if (queue.length > width) sum -= queue.shift();
      return sum / queue.length;
    };
  })(10);

  function glyph(name, extraClass) {
    var result = document.createElement("span");
    result.classList.add("glyphicon", "glyphicon-" + name);
    if (extraClass) result.classList.add(extraClass);
    return result;
  }

  function computeCalories(item) {
    if (item.hasOwnProperty('calories')) return item.calories;
    if (item.hasOwnProperty('unit_calories')) {
      item.calories = item.quantity * item.unit_calories;
      return item.calories;
    }
    return NaN;
  }

  var previousWeight = NaN;
  var lowestWeight = { weight: Infinity };
  var highestWeight = { weight: -Infinity };
  FoodLog.forEach(function(entry) {
    var date = parseDate(entry.date);
    entry._date = date;

    entry.average = accumulateMovingAverage(entry.weight);
    entry.error = entry.weight - entry.average;

    table.appendChild(template('#tbody'));

    var tbody = last(table.tBodies)
    var tr = tbody.rows[0]
    tr.cells[1].innerText = date.toLocaleDateString('en-us', {weekday: 'long', month: 'numeric', day: 'numeric'});
    tr.cells[3].innerText = entry.weight;
    tr.cells[5].innerText = entry.steps || 'na';

    var deltaWeight = entry.weight - previousWeight;
    if (deltaWeight > 0.24) {
      tbody.rows[0].classList.add("bg-danger");
      tr.cells[3].appendChild(glyph("arrow-up", "text-danger"));
    } else if (deltaWeight < -0.24) {
      tbody.rows[0].classList.add("bg-success");
      tr.cells[3].appendChild(glyph("arrow-down", "text-success"));
    } else {
      tbody.rows[0].classList.add("bg-warning");
    }

    previousWeight = entry.weight;
    if (entry.weight < lowestWeight.weight) lowestWeight = { date: date, weight: entry.weight };
    if (entry.weight > highestWeight.weight) highestWeight = { date: date, weight: entry.weight };

    var mealRow = 3;
    entry.meals.forEach(function(meal) {
      tbody.appendChild(template('#summary-row'));
      summaryRow = last(tbody.rows);

      mealSummary = [];
      mealCalories = 0;
      meal.items.forEach(function(item) {
        tbody.appendChild(template('#food-row'));
        tr = last(tbody.rows);
        tr.cells[0].innerText = item.food + ", " + item.quantity + item.units;
        var kCal = computeCalories(item);
        tr.cells[1].innerText = kCal;
        mealSummary.push(item.food);
        mealCalories += kCal;
      });

      summaryRow.cells[0].innerText = meal.time;
      summaryRow.cells[1].innerText = mealSummary.join(", ");
      summaryRow.cells[2].innerText = mealCalories;
      summaryRow.cells[3].innerText = meal.location;
      summaryRow.cells[4].innerText = meal.mood;

      mealRows = meal.items.length + 1;

      tr = tbody.rows[mealRow];
      td = tr.insertCell(0);
      // td.innerText = meal.time;
      td.setAttribute('rowspan', meal.items.length);
      mealRow += mealRows;
    });
  });
  setDataTag(document.querySelector('#footnote1 data'), lowestWeight.weight);
  setTimeTag(document.querySelector('#footnote1 time'), lowestWeight.date);
  setDataTag(document.querySelector('#footnote2 data'), FoodLog[FoodLog.length - 1].average.toFixed(2));

  /*
  var loss = highestWeight.weight - lowestWeight.weight;
  var period = (lowestWeight.date.getTime() - highestWeight.date.getTime()) / 1000 / 60 / 60 / 24 / 7;
  function roundTo(x, z) { return Math.round(x * z) / z; }
  setDataTag(document.querySelector('#footnote3 data'), roundTo(loss / period, 20));
  */

  function collect(key) {
    if (typeof key == 'function') return function(entry) { return { x: entry._date, y: key(entry) }; };
    return function(entry) { return { x: entry._date, y: entry[key] }; };
  }
  function sum(collection, key) {
    if (key) return collection.reduce(function(acc, entry) { return acc + entry[key]; }, 0);
    return collection.reduce(function(acc, entry) { return acc + entry; }, 0);
  };

  var weights = FoodLog.map(collect('weight'));
  var averages = FoodLog.map(collect('average'));
  var weightErrors = FoodLog.map(collect('error'));
  var meanVariation = sum(FoodLog, 'error') / FoodLog.length;
  var sigmaVariation = Math.sqrt(sum(FoodLog.map(function(entry) { var delta = entry.error - meanVariation; return delta*delta; }))/FoodLog.length);
  var steps = FoodLog.map(collect('steps'));
  var calories = FoodLog.map(function(entry, i) { return { x: entry._date, y: sum(entry.meals.map(function(entry) { return sum(entry.items, 'calories'); })) }; });

  setDataTag(document.querySelector('#footnote3 data:first-of-type'), meanVariation.toFixed(2));
  setDataTag(document.querySelector('#footnote3 data:last-of-type'), (2.575829 * sigmaVariation).toFixed(2));

  function barChart(selector, label, series) {
    var chart = nv.models.multiBarChart()
      .showControls(false)
      .rotateLabels(-60);

    chart.xAxis
      .tickFormat(d3.time.format.utc('%b %-d'));
    chart.yAxis
      .axisLabel(label)
      .tickFormat(d3.format(',f'));

    d3.select(selector)
      .datum([{ key: label, values: series, color: 'currentColor' }])
      .call(chart);

    nv.utils.windowResize(chart.update);
  }

  function lineChart(selector, label, series) {
    var chart = nv.models.lineChart()
      .useInteractiveGuideline(true)
      .showXAxis(true)
      .showYAxis(true)
      ;

    var fmt = new Intl.DateTimeFormat('en-US', { month: "short", day: "numeric" })
    chart.xAxis
      .tickFormat(function(d) { return fmt.format(new Date(d)); });
    chart.yAxis
      .axisLabel(label)
      .tickFormat(d3.format(',.2f'));

    d3.select(selector)
      .datum(series)
      .call(chart);
  }

  nv.addGraph(function() {
    barChart('#calories-chart svg', 'Calories', calories);
    barChart('#steps-chart svg', 'Steps', steps);
    lineChart('#weight-chart svg', 'Weight (kg)', [
        { key: 'Weight', values: weights },
        { key: 'Average', values: averages }
      ]);
    lineChart('#weight-noise-chart svg', 'Variation (kg)', [
        { key: 'Weight Variation', values: weightErrors }
      ]);
  });

  document.body.scrollTop = Math.min(document.body.scrollHeight, table.offsetHeight + table.offsetTop);
});
