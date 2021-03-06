/* ImageMapster
   Version: see $.mapster.version

Copyright 2011 James Treworgy
http://www.outsharked.com/imagemapster
https://github.com/jamietre/ImageMapster

A jQuery plugin to enhance image maps.
*/
/*
/// LICENSE (MIT License)
///
/// Permission is hereby granted, free of charge, to any person obtaining
/// a copy of this software and associated documentation files (the
/// "Software"), to deal in the Software without restriction, including
/// without limitation the rights to use, copy, modify, merge, publish,
/// distribute, sublicense, and/or sell copies of the Software, and to
/// permit persons to whom the Software is furnished to do so, subject to
/// the following conditions:
///
/// The above copyright notice and this permission notice shall be
/// included in all copies or substantial portions of the Software.
///
/// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
/// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
/// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
/// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
/// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
/// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
/// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
///
/// January 19, 2011
*/

/*jslint eqeqeq: false */
/*global jQuery: true, Zepto: true */


(function ($) {
    // all public functions in $.mapster.impl are methods
    $.fn.mapster = function (method) {
        var m = $.mapster.impl;
        if ($.isFunction(m[method])) {
            return m[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || !method) {
            return m.bind.apply(this, arguments);
        } else {
            $.error('Method ' + method + ' does not exist on jQuery.mapster');
        }
    };

    $.mapster = {
        version: "1.2.5b30",
        render_defaults: {
            fade: false,
            fadeDuration: 150,
            altImage: null,
            altImageOpacity: 0.7,
            fill: true,
            fillColor: '000000',
            fillColorMask: 'FFFFFF',
            fillOpacity: 0.5,
            stroke: false,
            strokeColor: 'ff0000',
            strokeOpacity: 1,
            strokeWidth: 1,
            includeKeys: '',
            alt_image: null // used internally
        },
        defaults: {
            highlight: null,     // let device type determine highlighting
            wrapClass: null,
            wrapCss: null,
            onGetList: null,
            sortList: false,
            listenToList: false,
            mapKey: '',
            mapValue: '',
            singleSelect: false,
            listKey: 'value',
            listSelectedAttribute: 'selected',
            listSelectedClass: null,
            onClick: null,
            onMouseover: null,
            onMouseout: null,
            onStateChange: null,
            boundList: null,
            onConfigured: null,
            configTimeout: 10000,
            noHrefIsMask: true,
            scaleMap: true,
            safeLoad: false,
            areas: []
        },
        shared_defaults: {
            render_highlight: { fade: true },
            render_select: { fade: false },        
            staticState: null,
            selected: null,
            isSelectable: true,
            isDeselectable: true
        },
        area_defaults:
        {
            includeKeys: '',
            isMask: false
        },
        canvas_style: {
            position: 'absolute',
            left: 0,
            top: 0,
            padding: 0,
            border: 0
        },
        hasCanvas: null,
        isTouch: null,
        windowLoaded: false,
        map_cache: [],
        hooks: {},
        addHook: function(name,callback) {
            this.hooks[name]=(this.hooks[name]||[]).push(callback);
        },
        callHooks: function(name,context) {
            $.each(this.hooks[name]||[],function() {
                this.apply(context);
            });
        },
        utils: {

            //            extend: function (target, sources, deep) {
            //                var i,u=this;
            //                $.extend.call(null, [target].concat(sources));
            //                for (i = 0; i < deep.length; i++) {
            //                    u.extend(
            //                }
            //            },
            // return four outer corners, as well as possible places

            // extends the constructor, returns a new object prototype. Does not refer to the
            // original constructor so is protected if the original object is altered. This way you
            // can "extend" an object by replacing it with its subclass.
            subclass: function (Obj, constr) {
                var proto = new Obj(),
                    sub = function () {
                        proto.constructor.apply(this, arguments);
                        constr.apply(this, arguments);
                    };
                sub.prototype = proto.constructor.prototype;
                return sub;
            },
            asArray: function (obj) {
                return obj.constructor === Array ?
                    obj : this.split(obj, ',');
            },
            // clean split: no padding or empty elements
            split: function (text) {
                var i, arr = text.split(',');
                for (i = arr.length - 1; i >= 0; i--) {
                    arr[i] = $.trim(arr[i]);
                    if (!arr[i]) {
                        arr = arr.splice(i, 1);
                    }
                }
                return arr;
            },
            setOpacity: function (e, opacity) {
                if (!$.mapster.hasCanvas) {
                    e.style.filter = "Alpha(opacity=" + String(opacity * 100) + ")";
                } else {
                    e.style.opacity = opacity;
                }
            },
            // similar to $.extend but does not add properties (only updates), unless the
            // first argument is an empty object, then all properties will be copied
            updateProps: function (_target, _template) {
                var onlyProps,
                    target = _target || {},
                    template = $.isEmptyObject(target) ? _template : _target;

                //if (template) {
                onlyProps = [];
                $.each(template, function (prop) {
                    onlyProps.push(prop);
                });
                //}

                $.each(Array.prototype.slice.call(arguments, 1), function (i, obj) {
                    $.each(obj || {}, function (prop, val) {
                        if (!onlyProps || $.inArray(prop, onlyProps) >= 0) {
                            var p = obj[prop];
                            if (typeof p !== 'undefined') {
                                if ($.isPlainObject(p)) {
                                    // not recursive - only copies 1 level of subobjects, and always merges
                                    target[prop] = $.extend(target[prop] || {}, p);
                                } else if (p && p.constructor === Array) {
                                    target[prop] = p.slice(0);
                                } else {
                                    target[prop] = obj[prop];
                                }
                            }
                        }
                    });
                });
                return target;
            },
            isElement: function (o) {
                return (typeof HTMLElement === "object" ? o instanceof HTMLElement :
                        o && typeof o === "object" && o.nodeType === 1 && typeof o.nodeName === "string");
            },
            // finds element of array or object with a property "prop" having value "val"
            // if prop is not defined, then just looks for property with value "val"
            indexOfProp: function (obj, prop, val) {
                var result = obj.constructor === Array ? -1 : null;
                $.each(obj, function (i, e) {
                    if (e && (prop ? e[prop] : e) === val) {
                        result = i;
                        return false;
                    }
                });
                return result;
            },
            // returns "obj" if true or false, or "def" if not true/false
            boolOrDefault: function (obj, def) {
                return this.isBool(obj) ?
                        obj : def || false;
            },
            isBool: function (obj) {
                return typeof obj === "boolean";
            },
            // evaluates "obj", if function, calls it with args
            // (todo - update this to handle variable lenght/more than one arg)
            ifFunction: function (obj, that, args) {
                if ($.isFunction(obj)) {
                    obj.call(that, args);
                }
            },
            isImageLoaded: function (img) {
                if (typeof img.complete !== 'undefined' && !img.complete) {
                    return false;
                }
                if (typeof img.naturalWidth !== 'undefined' &&
                                    (img.naturalWidth === 0 || img.naturalHeight === 0)) {
                    return false;
                }
                return true;
            },
            fader: (function () {
                var elements = {},
                        lastKey = 0,
                        fade_func = function (el, op, endOp, duration) {
                            var index, obj, u = $.mapster.utils;
                            if (typeof el === 'number') {
                                obj = elements[el];
                                if (!obj) {
                                    return;
                                }
                            } else {
                                index = u.indexOfProp(elements, null, el);
                                if (index) {
                                    delete elements[index];
                                }
                                elements[++lastKey] = obj = el;
                                el = lastKey;
                            }
                            endOp = endOp || 1;

                            op = (op + (endOp / 10) > endOp - 0.01) ? endOp : op + (endOp / 10);

                            u.setOpacity(obj, op);
                            if (op < endOp) {
                                setTimeout(function () {
                                    fade_func(el, op, endOp, duration);
                                }, duration ? duration / 10 : 15);
                            }
                        };
                return fade_func;
            } ())
        },
        getBoundList: function (opts, key_list) {
            if (!opts.boundList) {
                return null;
            }
            var index, key, result = $(), list = key_list.split(',');
            opts.boundList.each(function () {
                for (index = 0; index < list.length; index++) {
                    key = list[index];
                    if ($(this).is('[' + opts.listKey + '="' + key + '"]')) {
                        result = result.add(this);
                    }
                }
            });
            return result;
        },
        // Causes changes to the bound list based on the user action (select or deselect)
        // area: the jQuery area object
        // returns the matching elements from the bound list for the first area passed (normally only one should be passed, but
        // a list can be passed
        setBoundListProperties: function (opts, target, selected) {
            target.each(function () {
                if (opts.listSelectedClass) {
                    if (selected) {
                        $(this).addClass(opts.listSelectedClass);
                    } else {
                        $(this).removeClass(opts.listSelectedClass);
                    }
                }
                if (opts.listSelectedAttribute) {
                    $(this).attr(opts.listSelectedAttribute, selected);
                }
            });
        },
        getMapDataIndex: function (obj) {
            var img, id;
            switch (obj.tagName && obj.tagName.toLowerCase()) {
                case 'area':
                    id = $(obj).parent().attr('name');
                    img = $("img[usemap='#" + id + "']")[0];
                    break;
                case 'img':
                    img = obj;
                    break;
            }
            return img ?
                this.utils.indexOfProp(this.map_cache, 'image', img) : -1;
        },
        getMapData: function (obj) {
            var index = this.getMapDataIndex(obj);
            if (index >= 0) {
                return index >= 0 ? this.map_cache[index] : null;
            }
        },
        queueCommand: function (map_data, that, command, args) {
            if (!map_data) {
                return false;
            }
            if (!map_data.complete) {
                map_data.commands.push(
                {
                    that: that,
                    command: command,
                    args: args
                });
                return true;
            }
            return false;
        },
        unload: function () {
            this.impl.unload();
            this.utils = null;
            this.impl = null;
            $.fn.mapster = null;
            $.mapster = null;
            $('*').unbind();
        }
    };

    // Config for object prototypes
    // first: use only first object (for things that should not apply to lists)
    /// calls back one of two fuinctions, depending on whether an area was obtained.
    // opts: {
    //    name: 'method name',
    //    key: 'key,
    //    args: 'args'
    //
    //}
    // name: name of method
    // args: arguments to re-call with
    // Iterates through all the objects passed, and determines whether it's an area or an image, and calls the appropriate
    // callback for each. If anything is returned from that callback, the process is stopped and that data return. Otherwise,
    // the object itself is returned.
    var m = $.mapster;
    m.Method = function (that, func_map, func_area, opts) {
        var me = this;
        me.output = that;
        me.input = that;
        me.first = opts.first || false;
        me.args = opts.args ? Array.prototype.slice.call(opts.args, 0) : null;
        me.key = opts.key;
        me.name = opts.name;
        me.func_map = func_map;
        me.func_area = func_area;
        //$.extend(me, opts);
        me.name = opts.name;
    };
    m.Method.prototype.go = function () {
        var i,  data, ar, len, result, src = this.input,
                area_list = [],
                me = this,
                args = me.args || [];
        len = src.length;
        for (i = 0; i < len; i++) {
            data = $.mapster.getMapData(src[i]);
            if (data) {
                if (m.queueCommand(data, this.input, this.name, args)) {
                    if (this.first) {
                        result = '';
                    }
                    continue;
                }
                ar = data.getData(src[i].nodeName === 'AREA' ? src[i] : this.key);
                if (ar) {
                    if ($.inArray(ar, area_list) < 0) {
                        area_list.push(ar);
                    }
                } else {
                    result = this.func_map.apply(data, args);
                }
                if (this.first || typeof result !== 'undefined') {
                    break;
                }
            }
        }
        // if there were areas, call the area function for each unique group
        $(area_list).each(function () {
            result = me.func_area.apply(this, args);
        });

        if (typeof result !== 'undefined') {
            return result;
        } else {
            return this.output;
        }
    };


    $.mapster.impl = (function () {
        var me = {},
            m = $.mapster,
            u = $.mapster.utils,
            removeMap, addMap;

        addMap = function (map_data) {
            return m.map_cache.push(map_data) - 1;
        };
        removeMap = function (map_data) {
            m.map_cache.splice(map_data.index, 1);
            for (var i = m.map_cache.length - 1; i >= this.index; i--) {
                m.map_cache[i].index--;
            }
        };
        /// return current map_data for an image or area

        // merge new area data into existing area options. used for rebinding.
        function merge_areas(map_data, areas) {
            var ar, index,
                map_areas = map_data.options.areas;
            if (areas) {
                $.each(areas, function (i, e) {
                    index = u.indexOfProp(map_areas, "key", this.key);
                    if (index >= 0) {
                        $.extend(map_areas[index], this);
                    }
                    else {
                        map_areas.push(this);
                    }
                    ar = map_data.getDataForKey(this.key);
                    if (ar) {
                        $.extend(ar.options, this);
                    }
                });
            }
        }
        function merge_options(map_data, options) {
            var temp_opts = u.updateProps({}, options);
            delete temp_opts.areas;
            u.updateProps(map_data.options, temp_opts);

            merge_areas(map_data, options.areas);
            // refresh the area_option template
            u.updateProps(map_data.area_options, map_data.options);

            $.each(map_data.data, function (i, e) {
                e._effectiveOptions = null;
            });
        }

        // Returns a comma-separated list of user-selected areas. "staticState" areas are not considered selected for the purposes of this method.
        me.get = function (key) {
            return (new m.Method(this,
                function () {
                    // map_data return
                    return this.getSelected();
                },
                function () {
                    return this.isSelected();
                },
                { name: 'get',
                    args: arguments,
                    key: key,
                    first: true,
                    defaultReturn: ''
                }
            )).go();
        };
        me.data = function (key) {
            return (new m.Method(this,
                null,
                function () {
                    return this;
                },
                { name: 'data',
                    args: arguments,
                    key: key
                }
            )).go();
        };


        // Set or return highlight state.
        //  $(img).mapster('highlight') -- return highlighted area key, or null if none
        //  $(area).mapster('highlight') -- highlight an area
        //  $(img).mapster('highlight','area_key') -- highlight an area
        //  $(img).mapster('highlight',false) -- remove highlight
        me.highlight = function (key) {
            return (new m.Method(this,
                function (selected) {
                    if (key === false) {
                        this.ensureNoHighlight();
                    } else {
                        var id = this._highlightId;
                        return id >= 0 ? this.data[id].key : null;
                    }
                },
                function () {
                    this.highlight();
                },
                { name: 'highlight',
                    args: arguments,
                    key: key,
                    first: true
                }
            )).go();
        };
        me.select = function () {
            me.set.call(this, true);
        };
        me.deselect = function () {
            me.set.call(this, false);
        };
        // Select or unselect areas identified by key -- a string, a csv string, or array of strings.
        // if set_bound is true, the bound list will also be updated. Default is true. If neither true nor false,
        // it will be toggled.
        me.set = function (selected, key, set_bound) {
            var lastParent, parent, map_data, do_set_bound,
                key_list,
                area_list = []; // array of unique areas passed

            function setSelection(ar) {
                if (ar) {
                    switch (selected) {
                        case true:
                            ar.addSelection(); break;
                        case false:
                            ar.removeSelection(true); break;
                        default:
                            ar.toggleSelection(); break;
                    }
                }
            }

            do_set_bound = u.isBool(set_bound) ? set_bound : true;

            this.each(function () {
                var ar;
                map_data = m.getMapData(this);
                if (!map_data) {
                    return true; // continue
                }
                key_list = '';
                if ($(this).is('img')) {
                    if (m.queueCommand(map_data, $(this), 'set', [selected, key, do_set_bound])) {
                        return true;
                    }
                    if (key instanceof Array) {
                        if (key.length) {
                            key_list = key.join(",");
                        }
                    }
                    else {
                        key_list = key;
                    }

                    if (key_list) {
                        $.each(u.split(key_list), function (i, e) {
                            setSelection(map_data.getDataForKey(e.toString()));
                        });
                        if (!selected) {
                            map_data.removeSelectionFinish();
                        }
                    }

                } else {
                    parent = $(this).parent()[0];
                    // it is possible for areas from different mapsters to be passed, make sure we're on the right one.
                    if (lastParent && parent !== lastParent) {
                        map_data = m.getMapData(this);
                        if (!map_data) {
                            return true;
                        }
                        lastParent = parent;
                    }
                    lastParent = parent;

                    if (m.queueCommand(map_data, $(this), 'set', [selected, key, do_set_bound])) {
                        return true;
                    }

                    ar = map_data.getDataForArea(this);

                    if ($.inArray(ar, area_list) < 0) {
                        area_list.push(ar);
                        key_list+=key_list===''?'':','+ar.key;
                    }
                }
            });
            // set all areas collected from the loop

            $.each(area_list, function (i, el) {
                setSelection(el);
            });
            if (do_set_bound && map_data.options.boundList) {
                m.setBoundListProperties(map_data.options, m.getBoundList(map_data.options, key_list), selected);
            }

            return this;
        };
        me.unbind = function (preserveState) {
            return (new m.Method(this,
                function () {
                    this.clearEvents();
                    this.clearMapData(preserveState);
                    removeMap(this);
                },
                null,
                { name: 'unbind',
                    args: arguments
                }
            )).go();
        };


        // refresh options and update selection information.
        me.rebind = function (options, replaceOptions) {
            return (new m.Method(this,
                function () {
                    if (replaceOptions) {
                        this.options = u.updateProps({}, m.defaults, options);
                        $.each(this.data,function() {
                            this.options={};
                        });
                    }
                    
                    merge_options(this, options);
                    this.setAreaOptions(options.areas || {});

                    this.redrawSelections();
                },
                null,
                {
                    name: 'rebind',
                    args: arguments
                }
            )).go();
        };
        // get options. nothing or false to get, or "true" to get effective options (versus passed options)
        me.get_options = function (key, effective) {
            var eff = u.isBool(key) ? key : effective; // allow 2nd parm as "effective" when no key
            return (new m.Method(this,
                function () {
                    var opts = $.extend({}, this.options);
                    if (eff) {
                        opts.render_select = u.updateProps(
                            {},
                            m.render_defaults,
                            opts,
                            opts.render_select);

                        opts.render_highlight = u.updateProps(
                            {},
                            m.render_defaults,
                            opts,
                            opts.render_highlight);
                    }
                    return opts;
                },
                function () {
                    return eff ? this.effectiveOptions() : this.options;
                },
                {
                    name: 'get_options',
                    args: arguments,
                    first: true,
                    key: key
                }
            )).go();
        };

        // set options - pass an object with options to set,
        me.set_options = function (options) {
            return (new m.Method(this,
                function () {
                    merge_options(this, options);
                },
                null,
                {
                    name: 'set_options',
                    args: arguments
                }
            )).go();
        };
        me.unload = function () {
            var i;
            for (i = m.map_cache.length - 1; i >= 0; i--) {
                if (m.map_cache[i]) {
                    me.unbind.call($(m.map_cache[i].image));
                }
            }
            me.graphics = null;
        };

        me.snapshot = function () {
            return (new m.Method(this,
                function () {
                    $.each(this.data, function (i, e) {
                        e.selected = false;
                    });

                    this.base_canvas = this.graphics.createVisibleCanvas(this.image);
                    $(this.image).before(this.base_canvas);
                },
                null,
                { name: 'snapshot' }
            )).go();
        };
        // do not queue this function
        me.state = function () {
            var md, result = null;
            $(this).each(function () {
                if (this.nodeName === 'IMG') {
                    md = m.getMapData(this);
                    if (md) {
                        result = md.state();
                    }
                    return false;
                }
            });
            return result;
        };

        me.bind = function (options) {
            var opts = u.updateProps({}, m.defaults, options);

            return this.each(function () {
                var img, map, usemap, map_data;

                // save ref to this image even if we can't access it yet. commands will be queued
                img = $(this);

                // sorry - your image must have border:0, things are too unpredictable otherwise.
                img.css('border', 0);

                map_data = m.getMapData(this);
                // if already bound completely, do a total rebind
                if (map_data) {
                    me.unbind.apply(img);
                    if (!map_data.complete) {
                        // will be queued
                        img.bind();
                        return true;
                    }
                    map_data = null;
                }

                // ensure it's a valid image
                // jQuery bug with Opera, results in full-url#usemap being returned from jQuery's attr.
                // So use raw getAttribute instead.
                usemap = this.getAttribute('usemap');
                map = usemap && $('map[name="' + usemap.substr(1) + '"]');
                if (!(img.is('img') && usemap && map.size() > 0)) {
                    return true;
                }

                if (!map_data) {
                    map_data = new m.MapData(this, opts);

                    map_data.index = addMap(map_data);
                    map_data.map = map;
                    // add the actual main image
                    map_data.addImage(this);
                    // will create a duplicate of the main image, which we use as a background
                    map_data.addImage(null, this.src);
                    // add alt images
                    if ($.mapster.hasCanvas) {
                        map_data.addImage(null, opts.render_highlight.altImage || opts.altImage, "highlight");
                        map_data.addImage(null, opts.render_select.altImage || opts.altImage, "select");
                    }
                    map_data.bindImages();
                }
            });
        };

        me.init = function (useCanvas) {
            var style, shapes;


            // check for excanvas explicitly - don't be fooled
            m.hasCanvas = (document.namespaces && document.namespaces.g_vml_) ? false :
                $('<canvas></canvas>')[0].getContext ? true : false;

            m.isTouch = 'ontouchstart' in document.documentElement;

            if (!(m.hasCanvas || document.namespaces)) {
                $.fn.mapster = function () {
                    return this;
                };
                return;
            }
            if (!u.isBool($.mapster.defaults.highlight)) {
                m.defaults.highlight = !m.isTouch;
            }

            $.extend(m.defaults, m.render_defaults,m.shared_defaults);
            $.extend(m.area_defaults, m.render_defaults,m.shared_defaults);

            // for testing/debugging, use of canvas can be forced by initializing manually with "true" or "false"
            if (u.isBool(useCanvas)) {
                m.hasCanvas = useCanvas;
            }
            if ($.browser.msie && !m.hasCanvas && !document.namespaces.v) {
                document.namespaces.add("v", "urn:schemas-microsoft-com:vml");
                style = document.createStyleSheet();
                shapes = ['shape', 'rect', 'oval', 'circ', 'fill', 'stroke', 'imagedata', 'group', 'textbox'];
                $.each(shapes,
                function (i, el) {
                    style.addRule('v\\:' + el, "behavior: url(#default#VML); antialias:true");
                });
            }
            
            // for safe load option
            $(window).bind('load', function () {
                m.windowLoaded = true;
                $(m.map_cache).each(function () {
                    if (!this.complete && this.isReadyToBind()) {
                        this.initialize();
                    }
                });
            });


        };
        me.test = function (obj) {
            return eval(obj);
        };
        return me;
    } ());

    $.mapster.impl.init();
} (jQuery));
