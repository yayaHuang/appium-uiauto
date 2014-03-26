/* globals $, au, codes */

UIAElementNil.prototype.type = function () {
  return "UIAElementNil";
};

UIAElementNil.prototype.isNil = function () { return true; };

// this is mechanic notation for extending $(UIAElement)
$.extend($.fn, {
  getActiveElement: function () {
      var foundElement = null;
      var checkAll = function (element) {
        var children = $(element).children();
        children.each(function (e, child) {
          var focused = $(child).isFocused();
          if (focused === true || focused === 1) {
            return child;
          }
          if (child.hasChildren()) { // big optimization
            checkAll(child);
          }
        });

        return null;
      };
      // try au.cache in the array first
      for (var key in au.cache) {
        var elemFocused = $(au.cache[key]).isFocused();
        if (elemFocused === true || elemFocused === 1) {
          return {
            status: codes.Success.code,
            value: {ELEMENT: key}
          };
        }
      }
      foundElement = checkAll(this);

      if (foundElement) {
        var varName = $(foundElement).name();
        return {
          status: codes.Success.code,
          value: {ELEMENT: varName}
        };
      }

      return {
        status: codes.NoSuchElement.code,
        value: null,
      };
    }

});

UIAElement.prototype.isNil = function () { return false; };

UIAElement.prototype.setValueByType = function (newValue) {
  var type = this.type();

  if (type === "UIATextField" || type === "UIASecureTextField" ||
      type === "UIATextView" || type === "UIASearchBar") {
    // do the full-on clear,keyboard typing operation
    this.setValue("");
    if (this.hasKeyboardFocus() === 0) {
      this.tap();
    }
    if (isAccented(newValue)) {
      this.setValue(newValue);
    } else {
      au.sendKeysToActiveElement(newValue);
    }
  } else if (type === "UIAPickerWheel") {
    this.selectValue(newValue);
  } else if (type === "UIASlider") {
    this.dragToValue(parseFloat(newValue));
  } else if (type === "UIAPageIndicator") {
    this.selectPage(parseInt(newValue, 10));
  } else {
    this.setValue(newValue);
  }
};

var isAccented = function (value) {
  for (var i = 0; i < value.length; i++) {
    var c = value.charCodeAt(i);
    if (c > 127) {
      // this is not simple ascii
      if (c >= parseInt("E000", 16) && c <= parseInt("E040", 16)) {
        // Selenium uses a Unicode PUA to cover certain special characters
        // see https://code.google.com/p/selenium/source/browse/java/client/src/org/openqa/selenium/Keys.java
        return false;
      }

      return true;
    }
  }

  return false;
};

UIAElement.prototype.type = function () {
  var type = this.toString();
  return type.substring(8, type.length - 1);
};

UIAElement.prototype.hasChildren = function () {
  var type = this.type();
  // NOTE: UIALink/UIAImage/UIAElement can have children
  return !(type === "UIAStaticText" || type === "UIATextField" ||
           type === "UIASecureTextField" || type === "UIAButton" ||
           type === "UIASwitch" || type === "UIAElementNil");
};

UIAElement.prototype.text = function () {
  var type = this.type();
  if (type === "UIAButton") {
    return this.label();
  } else {
    return this.value();
  }
};

UIAElement.prototype.matchesTagName = function (tagName) {
  var type = this.type();
  // i.e. "UIALink" matches "link:
  return type.substring(3).toLowerCase() === tagName.toLowerCase();
};

UIAElement.prototype.matchesBy = function (tagName, text) {
  if (!this.matchesTagName(tagName))
    return false;
  if (text === '')
    return true;
  var name = this.name();
  if (name)
    name = name.trim();
  if (name === text)
    return true;
  var value = this.value();
  if (value)
    value = String(value).trim();
  return value === text;
};

UIAElement.prototype.getTree = function () {
  var target = UIATarget.localTarget();
  target.pushTimeout(0);
  var getTree = function (element, elementIndex, parentPath) {
    var curPath = parentPath + "/" + elementIndex;
    var subtree = {
      "@": {
        name: element.name()
      , label: element.label()
      , value: element.value()
      , dom: typeof element.dom === "function" ? element.dom() : null
      , enabled: element.isEnabled() ? true : false
      , valid: element.isValid() ? true : false
      , visible: element.isVisible() === 1 ? true : false
      , hint: element.hint()
      , path: curPath
      }
    , rect: element.rect()
    , children: []
    };
    var children = element.elements();
    var numChildren = children.length;
    for (var i = 0; i < numChildren; i++) {
      var child = children[i];
      subtree.children.push(getTree(child, i, curPath));
    }
    var elType = element.type();
    var obj = {};
    obj[elType] = subtree;
    return obj;
  };
  var tree = getTree(this, 0, "");
  target.popTimeout();
  return tree;
};


UIAElement.prototype.getPageSource = function () {
  return JSON.stringify(this.getTree());
};

UIAElement.prototype.getElementLocation = function () {
  return {
    status: codes.Success.code,
    value: this.rect().origin
  };
};

UIAElement.prototype.getElementSize = function () {
  return {
    status: codes.Success.code,
    value: this.rect().size
  };
};

UIAElement.prototype.isDisplayed = function () {
  return {
    status: codes.Success.code,
    value: this.isVisible() === 1
  };
};

UIAElement.prototype.isSelected = function () {
  return {
    status: codes.Success.code,
    value: this.value() === 1
  };
};

// does a flick from a center of a specified element (use case: sliders)
UIAElement.prototype.touchFlick = function (xoffset, yoffset) {
  var options = {
    startOffset : {
      x: 0.5,
      y: 0.5
    },
    endOffset : {
      x: 0.5 + xoffset,
      y: 0.5 + yoffset
    }
  };

  this.flickInsideWithOptions(options);
  return {
    status: codes.Success.code,
    value: null
  };
};

UIAElement.prototype.getRelCoords = function (startX, startY, endX, endY) {
  var size = this.rect().size;
  if (startX === null) {
    startX = 0.5;
  }
  if (startY === null) {
    startY = 0.5;
  }
  if (Math.abs(startX) > 1) {
    startX = startX / size.width;
  }
  if (Math.abs(startY) > 1) {
    startY = startY / size.height;
  }
  if (Math.abs(endX) > 1) {
    endX = endX / size.width;
  }
  if (Math.abs(endY) > 1) {
    endY = endY / size.height;
  }
  return {
    startOffset: {
      x: parseFloat(startX)
    , y: parseFloat(startY)
    }
  , endOffset: {
      x: parseFloat(endX)
    , y: parseFloat(endY)
    }
  };
};

UIAElement.prototype.drag = function (startX, startY, endX, endY, duration, touchCount) {
  var options = this.getRelCoords(startX, startY, endX, endY);
  options.touchCount = parseInt(touchCount, 10);
  options.duration = parseFloat(duration);

  this.dragInsideWithOptions(options);
  return {
    status: codes.Success.code,
    value: null
  };
};

UIAElement.prototype.flick = function (startX, startY, endX, endY, touchCount) {
  var options = this.getRelCoords(startX, startY, endX, endY);
  options.touchCount = touchCount;

  this.flickInsideWithOptions(options);
  return {
    status: codes.Success.code,
    value: null
  };
};

UIAElement.prototype.complexTap = function (opts) {
  var coords = this.getRelCoords(opts.x, opts.y, 0, 0);
  opts = {
    tapCount: parseInt(opts.tapCount, 10)
  , duration: parseFloat(opts.duration)
  , touchCount: parseInt(opts.touchCount, 10)
  , tapOffset: coords.startOffset
  };
  return this.tapWithOptions(opts);
};

