// Pixel art data and rendering utilities.
// Extracted from app.js to reduce main file size.
// All exports are attached to window for use by app.js.
(function () {
  "use strict";

  var _ = null; // transparent pixel

  var PIXEL_ART = {
    doctor: [
      [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
      [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
      [_,"#fff","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fff",_],
      [_,"#fff","#fdd","#29f","#fdd","#fdd","#29f","#fdd","#fff",_],
      [_,_,"#fff","#fdd","#fdd","#fdd","#fdd","#fff",_,_],
      [_,_,"#fff","#fdd","#222","#222","#fdd","#fff",_,_],
      [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
      [_,"#fff","#29f","#fff","#29f","#29f","#fff","#29f","#fff",_],
      [_,"#fff","#29f","#29f","#29f","#29f","#29f","#29f","#fff",_],
      [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
    ],
    detective: [
      [_,_,"#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2",_,_,_],
      [_,"#7b1fa2","#7b1fa2","#9c27b0","#9c27b0","#9c27b0","#7b1fa2","#7b1fa2",_,_],
      ["#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2","#7b1fa2",_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
      [_,_,"#555","#555","#555","#555","#555","#555",_,_],
      [_,_,_,_,_,_,_,"#ff0","#ff0",_],
      [_,_,_,_,_,_,"#ff0","#ccc","#ff0","#ff0"],
    ],
    joker: [
      [_,"#f00","#ff0",_,_,"#0f0","#00f",_,_,_],
      ["#f00","#f00","#ff0","#ff0",_,"#0f0","#0f0","#00f",_,_],
      [_,"#ff0","#ff0","#ff0","#f0f","#0f0","#0f0","#00f","#00f",_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
      [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      [_,_,"#fdd","#f00","#f00","#f00","#f00","#fdd",_,_],
      [_,_,"#ff0","#0f0","#ff0","#0f0","#ff0","#0f0",_,_],
      [_,_,"#ff0","#0f0","#ff0","#0f0","#ff0","#0f0",_,_],
      [_,_,_,"#f00",_,_,"#00f",_,_,_],
    ],
    // Hunter: blaze-orange cap with a bill pointing right, olive field
    // jacket with orange vest stripes, brown boots, and a strung bow
    // (BOW_ART palette: #852 limbs, #ddd string) held at their left side.
    hunter: [
      [_,_,_,"#e60","#e60","#e60","#e60",_,_,_],
      [_,_,"#e60","#e60","#e60","#e60","#e60","#e60",_,_],
      ["#852",_,"#e60","#e60","#e60","#e60","#e60","#e60","#e60",_],
      ["#ddd","#852","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      ["#ddd","#852","#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
      ["#ddd","#852","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
      ["#ddd","#852","#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
      ["#852",_,"#574","#574","#574","#574","#574","#574",_,_],
      [_,_,"#574","#e60","#574","#574","#e60","#574",_,_],
      [_,_,"#653","#653",_,_,"#653","#653",_,_],
    ],
    citizen: [
      // 0: farmer
      [
        [_,_,"#8b4","#8b4","#8b4","#8b4","#8b4","#8b4",_,_],
        [_,"#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4",_],
        ["#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4","#8b4"],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#a62","#a62","#fdd","#fdd",_,_],
        [_,_,"#27a","#27a","#27a","#27a","#27a","#27a",_,_],
        [_,_,"#27a","#27a","#27a","#27a","#27a","#27a",_,_],
        [_,_,"#a62","#a62",_,_,"#a62","#a62",_,_],
      ],
      // 1: engineer
      [
        [_,_,"#ff0","#ff0","#ff0","#ff0","#ff0","#ff0",_,_],
        [_,"#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0",_],
        [_,"#ff0","#222","#222","#222","#222","#222","#222","#ff0",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#f80","#f80","#f80","#f80","#f80","#f80",_,_],
        [_,_,"#f80","#f80","#f80","#f80","#f80","#f80",_,_],
        [_,_,"#555","#555",_,_,"#555","#555",_,_],
      ],
      // 2: baker
      [
        [_,_,_,"#fff","#fff","#fff","#fff",_,_,_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#da4","#fff","#fff","#da4","#fff",_,_],
        [_,_,"#555","#555",_,_,"#555","#555",_,_],
      ],
      // 3: chef
      [
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,"#fff","#fff","#fff","#fff","#fff","#fff","#fff","#fff",_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#222","#fff","#fff","#222","#fff",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
      // 4: astronaut
      [
        [_,_,"#ccc","#ccc","#ccc","#ccc","#ccc","#ccc",_,_],
        [_,"#ccc","#48f","#48f","#48f","#48f","#48f","#48f","#ccc",_],
        [_,"#ccc","#48f","#48f","#48f","#48f","#48f","#48f","#ccc",_],
        [_,"#ccc","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#ccc",_],
        [_,"#ccc","#fdd","#222","#fdd","#fdd","#222","#fdd","#ccc",_],
        [_,_,"#ccc","#fdd","#fdd","#fdd","#fdd","#ccc",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#fff","#f80","#fff","#fff","#f80","#fff",_,_],
        [_,_,"#fff","#fff","#fff","#fff","#fff","#fff",_,_],
        [_,_,"#ccc","#ccc",_,_,"#ccc","#ccc",_,_],
      ],
      // 5: musician
      [
        [_,_,_,_,_,_,_,_,_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,"#333","#333","#333","#333","#333","#333","#333","#333",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#f00","#222","#222","#f00","#222",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 6: artist
      [
        [_,_,"#e44","#e44","#e44","#e44","#e44",_,_,_],
        [_,"#e44","#e44","#e44","#e44","#e44","#e44","#e44",_,_],
        [_,_,"#e44","#e44","#e44","#e44","#e44",_,_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#48f","#48f","#48f","#48f","#48f","#48f",_,_],
        [_,_,"#48f","#ff0","#0f0","#f0f","#f80","#48f",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
      // 7: firefighter
      [
        [_,_,"#d00","#d00","#d00","#d00","#d00","#d00",_,_],
        [_,"#d00","#ff0","#ff0","#ff0","#ff0","#ff0","#ff0","#d00",_],
        [_,"#d00","#d00","#d00","#d00","#d00","#d00","#d00","#d00",_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#d00","#d00","#d00","#d00","#d00","#d00",_,_],
        [_,_,"#d00","#ff0","#d00","#d00","#ff0","#d00",_,_],
        [_,_,"#333","#333",_,_,"#333","#333",_,_],
      ],
    ],
    mafia: [
      // 0: gun robber
      [
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,_,"#fdd","#222","#222","#222","#222","#fdd",_,_],
        [_,_,"#fdd","#fff","#fdd","#fdd","#fff","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,"#888"],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 1: sword warrior
      [
        [_,_,"#555","#555","#555","#555","#555","#555",_,_],
        [_,"#555","#555","#555","#555","#555","#555","#555","#555",_],
        [_,"#555","#555","#555","#555","#555","#555","#555","#555",_],
        [_,_,"#fdd","#555","#555","#555","#555","#fdd",_,_],
        [_,_,"#fdd","#d00","#fdd","#fdd","#d00","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#b77","#b77","#fdd","#fdd",_,_],
        ["#ccc",_,"#444","#444","#444","#444","#444","#444",_,_],
        ["#ccc",_,"#444","#d00","#444","#444","#d00","#444",_,_],
        ["#a82",_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 2: ninja
      [
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,"#222","#222","#222","#222","#222","#222","#222","#222",_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#fff","#222","#222","#fff","#222",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
      // 3: mafia boss
      [
        [_,_,"#333","#333","#333","#333","#333","#333",_,_],
        [_,"#333","#333","#333","#333","#333","#333","#333","#333",_],
        ["#333","#333","#333","#333","#333","#333","#333","#333","#333","#333"],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#222","#fdd","#fdd","#222","#fdd",_,_],
        [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
        [_,_,"#fdd","#fdd","#a62","#a62","#fdd","#fdd",_,_],
        [_,_,"#222","#222","#222","#222","#222","#222",_,_],
        [_,_,"#222","#fff","#222","#222","#fff","#222",_,_],
        [_,_,"#222","#222",_,_,"#222","#222",_,_],
      ],
    ],
  };

  // Card back: mafioso + civilian side by side
  var CARD_BACK_ART = [
    [_,"#222","#222","#222",_,     _,    _,    _,    _,    _   ],
    ["#333","#c22","#c22","#c22","#333", _,"#654","#654","#654", _  ],
    [_,"#fdd","#fdd","#fdd",_,     _,"#fdd","#fdd","#fdd", _  ],
    [_,"#222","#fdd","#222",_,     _,"#222","#fdd","#222", _  ],
    [_,"#fdd","#dbb","#fdd",_,     _,"#fdd","#fdd","#fdd", _  ],
    [_,"#fdd","#fdd","#fdd",_,     _,"#fdd","#b77","#fdd", _  ],
    [_,"#111","#c22","#111",_,     _,"#27a","#27a","#27a", _  ],
    [_,"#111","#c22","#111",_,     _,"#27a","#27a","#27a", _  ],
    [_,"#111", _ ,"#111",_,        _,"#27a", _ ,"#27a", _  ],
    [_,"#111", _ ,"#111",_,        _,"#333", _ ,"#333", _  ],
  ];

  // Skull pixel art for dead player card back
  var CARD_BACK_DEAD_ART = [
    [_,_,_,"#aaa","#aaa","#aaa","#aaa",_,_,_],
    [_,_,"#aaa","#ddd","#ddd","#ddd","#ddd","#aaa",_,_],
    [_,"#aaa","#ddd","#ddd","#ddd","#ddd","#ddd","#ddd","#aaa",_],
    [_,"#aaa","#ddd","#222","#222","#ddd","#222","#222","#aaa",_],
    [_,"#aaa","#ddd","#222","#222","#ddd","#222","#222","#aaa",_],
    [_,_,"#aaa","#ddd","#ddd","#333","#ddd","#ddd",_,_],
    [_,_,"#aaa","#ddd","#333","#ddd","#333","#aaa",_,_],
    [_,_,_,"#aaa","#ddd","#ddd","#ddd","#aaa",_,_],
    [_,_,_,"#aaa","#333","#ddd","#333","#aaa",_,_],
    [_,_,_,_,"#aaa","#aaa","#aaa",_,_,_],
  ];

  var THUMB_UP_ART = [
    [_,_,_,_,_,"#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,"#fdd",_,_,"#fdd","#fdd",_,_,_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_],
  ];

  var THUMB_DOWN_ART = [
    [_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd",_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,_,"#fdd",_,_,_,_],
  ];

  // Slide-to-confirm pixel art icons
  var KNIFE_ART = [
    [_,_,_,_,_,_,_,_,"#ccc",_],
    [_,_,_,_,_,_,_,"#ccc","#eee",_],
    [_,_,_,_,_,_,"#ccc","#eee","#ccc",_],
    [_,_,_,_,_,"#ccc","#eee","#ccc",_,_],
    [_,"#d32","#d32","#ccc","#eee","#ccc",_,_,_,_],
    [_,_,"#d32","#d32","#eee","#ccc",_,_,_,_],
    [_,_,_,"#a62","#ccc",_,_,_,_,_],
    [_,_,"#a62","#555","#a62",_,_,_,_,_],
    [_,"#a62","#555",_,"#555","#a62",_,_,_,_],
    [_,"#a62",_,_,_,"#a62",_,_,_,_],
  ];

  var CROSS_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,"#e53","#e53","#e53","#e53",_,_,_],
    [_,_,_,"#f44","#f66","#f66","#e53",_,_,_],
    [_,"#e53","#f44","#f44","#f66","#f66","#e53","#e53",_,_],
    [_,"#e53","#f66","#f66","#f88","#f88","#f66","#e53",_,_],
    [_,"#e53","#f44","#f66","#f88","#f66","#f44","#e53",_,_],
    [_,"#e53","#e53","#f44","#f66","#f66","#e53","#e53",_,_],
    [_,_,_,"#e53","#f44","#f44","#e53",_,_,_],
    [_,_,_,"#c32","#e53","#e53","#c32",_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  var MAGNIFIER_ART = [
    [_,_,_,"#9c27b0","#9c27b0","#9c27b0",_,_,_,_],
    [_,_,"#9c27b0",_,_,_,"#9c27b0",_,_,_],
    [_,"#9c27b0",_,_,_,_,_,"#9c27b0",_,_],
    [_,"#9c27b0",_,_,_,_,_,"#9c27b0",_,_],
    [_,_,"#9c27b0",_,_,_,"#9c27b0",_,_,_],
    [_,_,_,"#9c27b0","#9c27b0","#9c27b0",_,_,_,_],
    [_,_,_,_,_,_,"#a62",_,_,_],
    [_,_,_,_,_,_,_,"#a62",_,_],
    [_,_,_,_,_,_,_,_,"#a62",_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Bow-and-arrow icon for hunter revenge slide-to-confirm: dark-brown bow
  // limbs arcing right, pale string drawn straight at the left, fletched
  // arrow flying right through the grip.
  var BOW_ART = [
    [_,_,"#852","#852",_,_,_,_,_,_],
    [_,_,"#ddd","#852","#852",_,_,_,_,_],
    [_,_,"#ddd",_,"#852","#852",_,_,_,_],
    [_,_,"#ddd",_,_,"#852",_,"#ccc",_,_],
    ["#e53","#a62","#a62","#a62","#a62","#a62","#a62","#eee","#eee",_],
    [_,_,"#ddd",_,_,"#852",_,"#ccc",_,_],
    [_,_,"#ddd",_,"#852","#852",_,_,_,_],
    [_,_,"#ddd","#852","#852",_,_,_,_,_],
    [_,_,"#852","#852",_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // 8-bit clown icon for joker haunt slide-to-confirm
  var CLOWN_ART = [
    [_,_,"#e53",_,_,_,_,"#e53",_,_],
    [_,"#e53","#e53","#e53",_,_,"#e53","#e53","#e53",_],
    [_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_],
    [_,"#fdd","#29f",_,"#fdd","#fdd",_,"#29f","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#e53","#e53","#fdd","#fdd","#fdd",_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_],
    [_,_,"#fdd","#e53","#e53","#e53","#e53","#fdd",_,_],
    [_,_,_,"#fdd","#e53","#e53","#fdd",_,_,_],
    [_,_,_,_,"#fdd","#fdd",_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Trophy cup (amber) for game-over winner staging.
  var TROPHY_ART = [
    [_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d",_],
    ["#e8a33d","#b87d24","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#b87d24","#e8a33d"],
    ["#e8a33d","#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d","#e8a33d"],
    [_,"#e8a33d","#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d","#e8a33d",_],
    [_,_,"#e8a33d","#b87d24","#f0c068","#f0c068","#b87d24","#e8a33d",_,_],
    [_,_,_,"#e8a33d","#b87d24","#b87d24","#e8a33d",_,_,_],
    [_,_,_,_,"#e8a33d","#e8a33d",_,_,_,_],
    [_,_,_,"#b87d24","#e8a33d","#e8a33d","#b87d24",_,_,_],
    [_,_,"#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24",_,_],
    [_,_,"#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24",_,_],
  ];

  // Gear/cog (steel gray) for settings.
  var GEAR_ART = [
    [_,_,_,"#888",_,_,"#888",_,_,_],
    [_,_,"#888","#888","#888","#888","#888","#888",_,_],
    [_,"#888","#888",_,_,_,_,"#888","#888",_],
    ["#888","#888",_,_,"#222","#222",_,_,"#888","#888"],
    [_,"#888",_,"#222","#222","#222","#222",_,"#888",_],
    [_,"#888",_,"#222","#222","#222","#222",_,"#888",_],
    ["#888","#888",_,_,"#222","#222",_,_,"#888","#888"],
    [_,"#888","#888",_,_,_,_,"#888","#888",_],
    [_,_,"#888","#888","#888","#888","#888","#888",_,_],
    [_,_,_,"#888",_,_,"#888",_,_,_],
  ];

  // Scroll/rules sheet: amber roller frame, paper field, ink lines.
  var SCROLL_ART = [
    [_,"#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24",_],
    [_,"#b87d24","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#222","#222","#222","#222","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#222","#222","#222","#222","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#222","#222","#222","#ece5d8","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#ece5d8","#b87d24",_],
    [_,"#b87d24","#ece5d8","#222","#222","#222","#222","#ece5d8","#b87d24",_],
    [_,"#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24",_],
  ];

  // Padlock (amber) for the lock-in / locked-vote chip.
  var LOCK_ART = [
    [_,_,_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d",_,_,_],
    [_,_,"#e8a33d","#e8a33d",_,_,"#e8a33d","#e8a33d",_,_],
    [_,_,"#e8a33d",_,_,_,_,"#e8a33d",_,_],
    [_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d",_],
    [_,"#e8a33d","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#e8a33d",_],
    [_,"#e8a33d","#b87d24","#b87d24","#222","#b87d24","#b87d24","#b87d24","#e8a33d",_],
    [_,"#e8a33d","#b87d24","#b87d24","#222","#b87d24","#b87d24","#b87d24","#e8a33d",_],
    [_,"#e8a33d","#b87d24","#b87d24","#222","#b87d24","#b87d24","#b87d24","#e8a33d",_],
    [_,"#e8a33d","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#b87d24","#e8a33d",_],
    [_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d","#e8a33d",_],
  ];

  // Pointing hand (index finger right) for the nominate button.
  var POINT_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,"#fdd","#fdd","#fdd","#fdd","#fdd","#fdd"],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd",_,_,_,_],
    ["#fdd","#fdd","#fdd","#fdd","#fdd","#fdd","#fdd",_,_,_],
    [_,"#fdd","#fdd","#fdd","#fdd","#fdd",_,_,_,_],
    [_,_,"#fdd","#fdd","#fdd",_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Blood X for spare / object / dismiss.
  var X_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,"#b3202a","#b3202a",_,_,_,_,"#b3202a","#b3202a",_],
    [_,"#b3202a","#d4313c","#b3202a",_,_,"#b3202a","#d4313c","#b3202a",_],
    [_,_,"#b3202a","#d4313c","#b3202a","#b3202a","#d4313c","#b3202a",_,_],
    [_,_,_,"#b3202a","#d4313c","#d4313c","#b3202a",_,_,_],
    [_,_,_,"#b3202a","#d4313c","#d4313c","#b3202a",_,_,_],
    [_,_,"#b3202a","#d4313c","#b3202a","#b3202a","#d4313c","#b3202a",_,_],
    [_,"#b3202a","#d4313c","#b3202a",_,_,"#b3202a","#d4313c","#b3202a",_],
    [_,"#b3202a","#b3202a",_,_,_,_,"#b3202a","#b3202a",_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Blood heart for the lovers bond.
  var HEART_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,"#b3202a","#b3202a",_,_,_,"#b3202a","#b3202a",_,_],
    ["#b3202a","#d4313c","#d4313c","#b3202a",_,"#b3202a","#d4313c","#d4313c","#b3202a",_],
    ["#b3202a","#d4313c","#d4313c","#d4313c","#b3202a","#d4313c","#d4313c","#d4313c","#b3202a",_],
    ["#b3202a","#d4313c","#d4313c","#d4313c","#d4313c","#d4313c","#d4313c","#d4313c","#b3202a",_],
    [_,"#b3202a","#d4313c","#d4313c","#d4313c","#d4313c","#d4313c","#b3202a",_,_],
    [_,_,"#b3202a","#d4313c","#d4313c","#d4313c","#b3202a",_,_,_],
    [_,_,_,"#b3202a","#d4313c","#b3202a",_,_,_,_],
    [_,_,_,_,"#b3202a",_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Cracked heart (dark fissure) for the lover heartbreak beat.
  var HEARTBREAK_ART = [
    [_,_,_,_,_,_,_,_,_,_],
    [_,"#b3202a","#b3202a",_,_,_,"#b3202a","#b3202a",_,_],
    ["#b3202a","#d4313c","#d4313c","#b3202a",_,"#b3202a","#d4313c","#d4313c","#b3202a",_],
    ["#b3202a","#d4313c","#b3202a","#222",_,"#222","#b3202a","#d4313c","#b3202a",_],
    ["#b3202a","#d4313c","#d4313c",_,"#222","#d4313c","#d4313c","#d4313c","#b3202a",_],
    [_,"#b3202a","#d4313c","#222","#d4313c","#d4313c","#d4313c","#b3202a",_,_],
    [_,_,"#b3202a","#d4313c","#222","#d4313c","#b3202a",_,_,_],
    [_,_,_,"#b3202a","#222","#b3202a",_,_,_,_],
    [_,_,_,_,"#b3202a",_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Circular double-arrow (amber) for refresh / replay.
  var REFRESH_ART = [
    [_,_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d",_,"#e8a33d",_,_],
    [_,"#e8a33d","#e8a33d",_,_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d",_],
    ["#e8a33d","#e8a33d",_,_,_,_,_,"#e8a33d","#e8a33d","#e8a33d"],
    ["#e8a33d","#e8a33d",_,_,_,_,_,_,"#e8a33d",_],
    ["#e8a33d","#e8a33d",_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,"#e8a33d","#e8a33d"],
    [_,"#e8a33d",_,_,_,_,_,_,"#e8a33d","#e8a33d"],
    ["#e8a33d","#e8a33d","#e8a33d",_,_,_,_,_,"#e8a33d","#e8a33d"],
    [_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d",_,_,"#e8a33d","#e8a33d",_],
    [_,_,"#e8a33d","#e8a33d",_,"#e8a33d","#e8a33d","#e8a33d",_,_],
  ];

  // Amber crescent moon (transcribed from the approved mockup) for night.
  var MOON_ART = [
    [_,_,_,"#e8a33d","#e8a33d","#e8a33d",_,_,_,_],
    [_,_,"#e8a33d","#e8a33d","#e8a33d",_,_,_,_,_],
    [_,"#e8a33d","#e8a33d","#e8a33d",_,_,_,_,_,_],
    [_,"#e8a33d","#e8a33d",_,_,_,_,_,_,_],
    [_,"#e8a33d","#e8a33d",_,_,_,_,_,_,_],
    [_,"#e8a33d","#e8a33d",_,_,_,_,_,_,_],
    [_,"#e8a33d","#e8a33d","#e8a33d",_,_,_,_,_,_],
    [_,_,"#e8a33d","#e8a33d","#e8a33d",_,_,_,_,_],
    [_,_,_,"#e8a33d","#e8a33d","#e8a33d","#e8a33d",_,_,_],
    [_,_,_,_,_,_,_,_,_,_],
  ];

  // Amber sun disc with rays for dawn / day.
  var SUN_ART = [
    [_,_,_,_,"#e8a33d","#e8a33d",_,_,_,_],
    [_,"#b87d24",_,_,"#e8a33d","#e8a33d",_,_,"#b87d24",_],
    [_,_,"#e8a33d","#e8a33d","#f0c068","#f0c068","#e8a33d","#e8a33d",_,_],
    [_,_,"#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d",_,_],
    ["#e8a33d","#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d","#e8a33d"],
    ["#e8a33d","#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d","#e8a33d"],
    [_,_,"#e8a33d","#f0c068","#f0c068","#f0c068","#f0c068","#e8a33d",_,_],
    [_,_,"#e8a33d","#e8a33d","#f0c068","#f0c068","#e8a33d","#e8a33d",_,_],
    [_,"#b87d24",_,_,"#e8a33d","#e8a33d",_,_,"#b87d24",_],
    [_,_,_,_,"#e8a33d","#e8a33d",_,_,_,_],
  ];

  // Smoking-fedora mascot (16x16), transcribed pixel-for-pixel from the
  // logo SVG in index.html so both logo sites render from one source.
  var MASCOT_ART = [
    [_,_,_,_,_,_,"#1a1a1a","#1a1a1a","#1a1a1a","#1a1a1a",_,_,_,_,_,_],
    [_,_,_,_,_,"#222","#222","#222","#222","#222","#222",_,_,_,_,_],
    [_,_,_,_,_,"#222","#222","#222","#222","#222","#222",_,_,_,_,_],
    [_,_,_,"#2a2a2a","#2a2a2a","#b71c1c","#b71c1c","#b71c1c","#b71c1c","#b71c1c","#b71c1c","#2a2a2a","#2a2a2a",_,_,_],
    [_,_,_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_,_,_,"#555",_],
    [_,_,_,_,_,_,"#222","#fdd","#fdd","#222",_,_,_,"#888",_,_],
    [_,_,_,_,_,_,"#fdd","#dbb","#dbb","#fdd",_,_,"#aaa",_,_,_],
    [_,_,_,_,_,_,"#fdd","#fdd","#fdd","#fdd","#eee","#eee","#e53935",_,_,_],
    [_,_,_,_,_,_,"#fdd","#fdd","#fdd","#fdd",_,_,_,_,_,_],
    [_,_,_,_,_,"#111","#111","#b71c1c","#b71c1c","#111","#111",_,_,_,_,_],
    [_,_,_,_,_,"#111","#111","#b71c1c","#b71c1c","#111","#111",_,_,_,_,_],
    [_,_,_,_,_,"#1a1a1a","#1a1a1a","#b71c1c","#b71c1c","#1a1a1a","#1a1a1a",_,_,_,_,_],
    [_,_,_,_,_,_,"#1a1a1a","#1a1a1a","#1a1a1a","#1a1a1a",_,_,_,_,_,_],
    [_,_,_,_,_,_,"#111","#111","#111","#111",_,_,_,_,_,_],
    [_,_,_,_,_,"#0a0a0a","#0a0a0a","#0a0a0a","#0a0a0a","#0a0a0a","#0a0a0a",_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];

  // size = the viewBox edge length (default 10). Existing callers pass 10x10
  // grids and omit it; 16x16 grids (e.g. MASCOT_ART) pass size 16.
  function pixelArtToSvg(grid, size) {
    if (size === undefined) size = 10;
    var rows = grid.length;
    var rects = "";
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        if (grid[y][x]) {
          rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + grid[y][x] + '"/>';
        }
      }
    }
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' + rects + '</svg>';
  }

  // D4: deterministic client-side avatar hash.
  // djb2-style: h = ((h << 5) - h + charCode) | 0 — same on every client.
  function avatarIndexFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) {
      h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    }
    return h < 0 ? -h : h;
  }

  // D4: pre-reveal cosmetic avatar — citizen-profession only, role-agnostic.
  function getCosmeticAvatar(name) {
    var grids = PIXEL_ART.citizen;
    return pixelArtToSvg(grids[avatarIndexFor(name) % grids.length]);
  }

  function getRoleImage(role, variant) {
    if (role === "citizen") {
      var grids = PIXEL_ART.citizen;
      return pixelArtToSvg(grids[variant % grids.length]);
    }
    if (role === "mafia") {
      var grids = PIXEL_ART.mafia;
      return pixelArtToSvg(grids[variant % grids.length]);
    }
    if (PIXEL_ART[role]) {
      return pixelArtToSvg(PIXEL_ART[role]);
    }
    return "";
  }

  var ROLE_DESCRIPTIONS = {
    citizen: "You are a Citizen. Find and eliminate the Mafia to win.",
    mafia: "You are the Mafia. Eliminate citizens until you outnumber them.",
    doctor: "You are the Doctor. Each night, choose one player to protect from the Mafia.",
    detective: "You are the Detective. Each night, investigate one player to discover if they are Mafia.",
    joker: "You are the Joker. Win by getting yourself executed during the day vote.",
    hunter: "You are the Hunter. If you die, you may take one player down with you.",
  };

  var ROLE_COLORS = {
    citizen: "citizen",
    mafia: "mafia",
    doctor: "doctor",
    detective: "detective",
    joker: "joker",
    hunter: "hunter",
  };

  // Expose on window for app.js
  window.PIXEL_ART = PIXEL_ART;
  window.CARD_BACK_ART = CARD_BACK_ART;
  window.CARD_BACK_DEAD_ART = CARD_BACK_DEAD_ART;
  window.THUMB_UP_ART = THUMB_UP_ART;
  window.THUMB_DOWN_ART = THUMB_DOWN_ART;
  window.KNIFE_ART = KNIFE_ART;
  window.CROSS_ART = CROSS_ART;
  window.MAGNIFIER_ART = MAGNIFIER_ART;
  window.CLOWN_ART = CLOWN_ART;
  window.BOW_ART = BOW_ART;
  window.TROPHY_ART = TROPHY_ART;
  window.GEAR_ART = GEAR_ART;
  window.SCROLL_ART = SCROLL_ART;
  window.LOCK_ART = LOCK_ART;
  window.POINT_ART = POINT_ART;
  window.X_ART = X_ART;
  window.HEART_ART = HEART_ART;
  window.HEARTBREAK_ART = HEARTBREAK_ART;
  window.REFRESH_ART = REFRESH_ART;
  window.MOON_ART = MOON_ART;
  window.SUN_ART = SUN_ART;
  window.MASCOT_ART = MASCOT_ART;
  window.avatarIndexFor = avatarIndexFor;
  window.getCosmeticAvatar = getCosmeticAvatar;
  window.pixelArtToSvg = pixelArtToSvg;
  window.getRoleImage = getRoleImage;
  window.ROLE_DESCRIPTIONS = ROLE_DESCRIPTIONS;
  window.ROLE_COLORS = ROLE_COLORS;
})();
