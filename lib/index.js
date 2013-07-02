var fs = require('fs'),
    path = require('path'),
    LineStream = require('linestream'),
    assert = require('assert'),
    util = require('util');


var times = [];
function tick() {
    times.push(Date.now());
}

function bench(tag) {
    var e = Date.now();
    if (process.env.IDIFF_DEBUG) {
        console.log('%s: %g', tag, (e - times.pop())/1000.0);
    }
}

var linesep = '\n';

exports.diff = function(file1, file2, options, cb) {
    var hunks = [],
        matches = null,
        nl = 0,
        strHash = Object.create(null),
        strArray = [],
        strHashSize = 0,
        ls = LineStream.createLineStream(file1);

    var seq1 = [], seq2 = [];
    var seq = seq1, n1 = 0, n2 = 0;

    var p = process.stdout.write.bind(process.stdout);
    function lineHandle(line) {
        if (!(line in strHash)) {
            strArray[strHashSize] = line;
            strHash[line] = strHashSize++;
        }
        seq[nl++] = strHash[line];
    }

    function compare() {
        bench('lineHandle');
        tick();
        n2 = nl;

        n1++;
        n2++;
        var buf = new ArrayBuffer(n1*n2*4);
        matches = new Int32Array(buf);

        function M(r,c) {
            return matches[r*n2+c];
        }

        function max(a, b) {
            if (a >= b) return a;
            else return b;
        }

        tick();
        //fill
        var offset = 0, i, j;
        for (i = 1; i < n1; ++i) {
            offset += n2;
            for (j = 1; j < n2; ++j) {
                var v = (seq1[i-1] == seq2[j-1] ? 1 : 0);
                if (v == 1) {
                    // matches[offset+j] = M(i-1, j-1) + v;
                    matches[offset+j] = matches[offset - n2 + j-1] + v;

                } else {
                    // matches[offset+j] = max(M(i, j-1), M(i-1, j));
                    matches[offset+j] = max(
                        matches[offset + j-1], matches[offset - n2 + j]);
                }
            }
        }

        bench('fill');
        tick();
        var lt = '';
        i = n1 - 1, j = n2 - 1;
        while (i > 0 || j > 0) {
            var hunk;
            var v = seq1[i-1], v2 = seq2[j-1];
            if (v == v2) {
                hunk = {type: '=', val: [--i, --j]};

            } else {
                if (M(i, j) == M(i, j-1)) {
                    hunk = {type: '+', val: [j-1, j-1]};
                    j--;

                } else {
                    hunk = {type: '-', val: [i-1, i-1]};
                    i--;
                }
            }

            if (((hunk.type == '=' && lt == hunk.type) || (hunk.type != '=' && lt != '='))
               && hunks.length) {
                var a = hunks[0];
                assert.ok(a.length > 0);
                a.unshift(hunk);

            } else {
                hunks.unshift([hunk]);
            }

            lt = hunk.type;
        }
        bench('compacting');
        bench('compare');

        unified(hunks);
    }

    function unified(hunks, options) {
        tick();
        if (hunks.length == 0) return;

        p('--- ' + file1 + '   ' + new Date().toLocaleString() + '\n');
        p('+++ ' + file2 + '   ' + new Date().toLocaleString() + '\n');

        options = options || {ctx: 3};
        var ctx = options.ctx || 3; // compatible with diff -u NUM
        var lt = '='; // last hunk type

        function squzee(a, n, tail) {
            return tail ? a.splice(a.length - n, n) : a.splice(0, n);
        }

        var next = 0, compat = [];
        while (hunks.length) {
            var a = hunks.shift();
            if (a[0].type == '=') {
                var len = a.length;
                if (next > 0)
                    compat.push(squzee(a, ctx));

                if ((next == 0) || (next && len > ctx*2)) {
                    compat.push({type: '@'}); // insert a head type
                }

                if (hunks.length && a.length)
                    compat.push(squzee(a, ctx, true));

             } else {
                 compat.push(a);
             }

            next++;
        }

        function phead(rest) {
            var nr1 = 0, nr2 = 0, beg1 = 0, beg2 = 0;
            var start = true;
            for (var i = 0, len = rest.length; i < len && ('length' in rest[i]); ++i) {
                var a = rest[i];
                switch (a[0].type) {
                case '=':
                    if (start) {
                        // linum starts from 1
                        beg1 = a[0].val[0] + 1, beg2 = a[0].val[1] + 1;
                        start = false;
                    }
                    nr1 += a.length; nr2 += a.length; break;

                case '-':
                    nr1 += a.length; break;

                case '+':
                    nr2 += a.length; break;
                }
            }

            p(util.format('@@ -%d,%d +%d,%d @@\n', beg1, nr1, beg2, nr2));
        }

        while (compat.length) {
            var a = compat.shift();
            if ('length' in a) {
                while (a.length) {
                    var h = a.shift();
                    var s = h.type == '+' ? seq2: seq1 /* = or - */;
                    var t = h.type == '='? ' ': h.type;
                    p(t + strArray[s[h.val[0]]] + '\n');
                }

            } else {
                phead(compat);
            }
        }
        bench('end');
    }

    tick();
    ls.on('data', lineHandle);
    ls.on('end', function() {
        n1 = nl;
        nl = 0;
        ls = LineStream.createLineStream(file2);
        seq = seq2;
        ls.on('data', lineHandle);
        ls.on('end', compare);
    });
};
