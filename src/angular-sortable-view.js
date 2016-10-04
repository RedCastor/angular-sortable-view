//
// Copyright Kamil Pękala http://github.com/kamilkp
// angular-sortable-view v0.0.15 2015/01/18
//

;(function(window, angular){
	'use strict';
	/* jshint eqnull:true */
	/* jshint -W041 */
	/* jshint -W030 */

    /*
     Simple implementation of jQuery's .add method
     */
    function jqAdd(elem) {
        var i, res = angular.element();
        elem = angular.element(elem);
        for (i=0; i < this.length; i++) {
            res.push(this[i]);
        }
        for (i=0; i<elem.length; i++) {
            res.push(elem[i]);
        }
        return res;
    }

    angular.element(document.head).append([
        '<style>' +
        '.sv-helper{' +
        'position: fixed !important;' +
        'z-index: 99999;' +
        'margin: 0 !important;' +
        '}' +
        '.sv-candidate{' +
        '}' +
        '.sv-placeholder{' +
        // 'opacity: 0;' +
        '}' +
        '.sv-sorting-in-progress{' +
        '-webkit-user-select: none;' +
        '-moz-user-select: none;' +
        '-ms-user-select: none;' +
        'user-select: none;' +
        '}' +
        '.sv-visibility-hidden{' +
        'visibility: hidden !important;' +
        'opacity: 0 !important;' +
        '}' +
        '</style>'
    ].join(''));

    function touchFix(e){
        if(e.clientX === undefined && e.clientY === undefined) {
            var touches = e.touches || e.originalEvent.touches;
            if(touches && touches.length) {
                e.clientX = touches[0].clientX;
                e.clientY = touches[0].clientY;
            }
            e.preventDefault();
        }
    }

    function getPreviousSibling(element){
        element = element[0];

        if(element.previousElementSibling) {
            return angular.element(element.previousElementSibling);
        }
        else {
            var sib = element.previousSibling;
            while(sib != null && sib.nodeType != 1) {
                sib = sib.previousSibling;
            }

            return angular.element(sib);
        }
    }

    function getCssInt($element, style) {
        return parseInt($element.css(style)) || 0;
    }


    function getBoundingClientRect(element, withMargins) {
        function retZero() {
            return 0;
        }

        var result = {};
        var $element = angular.element(element);
        var bcr = element.getBoundingClientRect();
        var getCssIntFn = withMargins ? getCssInt : retZero;

        result.left   = bcr.left      - getCssIntFn($element, 'margin-left')   - getCssIntFn($element, 'border-left');
        result.right  = bcr.right     + getCssIntFn($element, 'margin-right')  + getCssIntFn($element, 'border-right');
        result.top    = bcr.top       - getCssIntFn($element, 'margin-top')    - getCssIntFn($element, 'border-top');
        result.bottom = bcr.bottom    + getCssIntFn($element, 'margin-bottom') + getCssIntFn($element, 'border-bottom');
        result.width  = result.right  - result.left;
        result.height = result.bottom - result.top;

        return result;
    }

    function insertElementBefore(element, newElement){
        var prevSibl = getPreviousSibling(element);
        if(prevSibl.length > 0){
            prevSibl.after(newElement);
        }
        else{
            element.parent().prepend(newElement);
        }
    }

    var dde = document.documentElement,
        matchingFunction = dde.matches ? 'matches' :
            dde.matchesSelector ? 'matchesSelector' :
                dde.webkitMatches ? 'webkitMatches' :
                    dde.webkitMatchesSelector ? 'webkitMatchesSelector' :
                        dde.msMatches ? 'msMatches' :
                            dde.msMatchesSelector ? 'msMatchesSelector' :
                                dde.mozMatches ? 'mozMatches' :
                                    dde.mozMatchesSelector ? 'mozMatchesSelector' : null;

    if(matchingFunction == null) {
        throw 'This browser doesn\'t support the HTMLElement.matches method';
    }

    function elementMatchesSelector(element, selector){
        if (element instanceof angular.element) {
            element = element[0];
        }

        if (matchingFunction !== null) {
            return element[matchingFunction](selector);
        }
    }

    var closestElement = angular.element.prototype.closest || function (selector){
        var el = this[0].parentNode;
        while (el !== document.documentElement && !el[matchingFunction](selector)) {
            el = el.parentNode;
        }

        if(el[matchingFunction](selector)) {
            return angular.element(el);
        }
        else {
            return angular.element();
        }
    };


	var module = angular.module('angular-sortable-view', []);
	module.directive('svRoot', [function(){
		function shouldBeAfter(elem, pointer, isGrid){
			return isGrid ? elem.x - pointer.x < 0 : elem.y - pointer.y < 0;
		}
		function getSortableElements(key){
			return ROOTS_MAP[key];
		}
		function removeSortableElements(key){
			delete ROOTS_MAP[key];
		}

		var sortingInProgress;
		var ROOTS_MAP = Object.create(null);
        var body = document.body;
		// window.ROOTS_MAP = ROOTS_MAP; // for debug purposes

		return {
			restrict: 'A',
			controller: ['$scope', '$attrs', '$interpolate', '$parse', '$element', function($scope, $attrs, $interpolate, $parse, $rootElement){
				var mapKey = $interpolate($attrs.svRoot)($scope) || $scope.$id;
				if(!ROOTS_MAP[mapKey]) ROOTS_MAP[mapKey] = [];

				var candidates;  // set of possible destinations
				var $placeholder;// placeholder element
				var options;     // sortable options
				var $helper;     // helper element - the one thats being dragged around with the mouse pointer
				var $original;   // original element
				var $target;     // last best candidate
				var isGrid       = false;
				var onSort       = $parse($attrs.svOnSort);

				// ----- hack due to https://github.com/angular/angular.js/issues/8044
				$attrs.svOnStart = $attrs.$$element[0].attributes['sv-on-start'];
				$attrs.svOnStart = $attrs.svOnStart && $attrs.svOnStart.value;

				$attrs.svOnStop = $attrs.$$element[0].attributes['sv-on-stop'];
				$attrs.svOnStop = $attrs.svOnStop && $attrs.svOnStop.value;
				// -------------------------------------------------------------------

				var onStart = $parse($attrs.svOnStart);
				var onStop = $parse($attrs.svOnStop);

                var isScrolling = false;
                var scroll = function (step, delay) {
                    var rootElement = $rootElement[0];
                    var scrollTop = rootElement.scrollTop;
                    var upperBound = Math.max(0, rootElement.scrollHeight - rootElement.clientHeight);
                    var newScrollTop = Math.min(Math.max(0, rootElement.scrollTop + step), upperBound);

                    if (newScrollTop !== scrollTop) {
                        rootElement.scrollTop = newScrollTop;

                        if (isScrolling) {
                            setTimeout(function () {
                                scroll(step)
                            }, delay);
                        }
                    } else {
                        isScrolling = false;
                    }
                };

				this.sortingInProgress = function(){
					return sortingInProgress;
				};

				if($attrs.svGrid){ // sv-grid determined explicite
					isGrid = $attrs.svGrid === "true" ? true : $attrs.svGrid === "false" ? false : null;
					if(isGrid === null)
						throw 'Invalid value of sv-grid attribute';
				}
				else{
					// check if at least one of the lists have a grid like layout
					$scope.$watchCollection(function(){
						return getSortableElements(mapKey);
					}, function(collection){
						isGrid = false;
						var array = collection.filter(function(item){
							return !item.container;
						}).map(function(item){
							return {
								part: item.getPart().id,
								y: item.element[0].getBoundingClientRect().top
							};
						});
						var dict = Object.create(null);
						array.forEach(function(item){
							if(dict[item.part])
								dict[item.part].push(item.y);
							else
								dict[item.part] = [item.y];
						});
						Object.keys(dict).forEach(function(key){
							dict[key].sort();
							dict[key].forEach(function(item, index){
								if(index < dict[key].length - 1){
									if(item > 0 && item === dict[key][index + 1]){
										isGrid = true;
									}
								}
							});
						});
					});
				}

				this.$moveUpdate = function(opts, mouse, svElement, svOriginal, svPlaceholder, originatingPart, originatingIndex){
					var svRect = getBoundingClientRect(svElement[0], true);
                    var rootRect = getBoundingClientRect($rootElement[0], true);
                    var containmentEl = opts.containment && closestElement.call(svElement, opts.containment)[0];
                    var containmentRect = containmentEl && getBoundingClientRect(containmentEl, true);
                    var scrollBoundTop = Math.max(rootRect.top, containmentRect ? containmentRect.top : 0);
                    var scrollBoundBottom = Math.min(rootRect.bottom, containmentRect ? containmentRect.bottom : Infinity);
                    var pRect, pCenter;

					if (opts.tolerance === 'element') {
                        mouse = {
                            x: ~~(svRect.left + svRect.width / 2),
                            y: ~~(svRect.top + svRect.height / 2)
                        };
                    }

					if (!$placeholder) {
						if(svPlaceholder){ // custom placeholder
							$placeholder = svPlaceholder.clone();
							$placeholder.removeClass('ng-hide');
						}
						else{ // default placeholder
							$placeholder = svOriginal.clone();
							$placeholder.addClass('sv-visibility-hidden');
							$placeholder.addClass('sv-placeholder');
							$placeholder.css({
								'height': svRect.height + 'px',
								'width': svRect.width + 'px'
							});
						}

						svOriginal.after($placeholder);
						svOriginal.addClass('ng-hide');

						// cache options, helper and original element reference
						$original = svOriginal;
						options = opts;
						$helper = svElement;

						onStart($scope, {
							$helper: {element: $helper},
							$part: originatingPart.model(originatingPart.scope),
							$index: originatingIndex,
							$item: originatingPart.model(originatingPart.scope)[originatingIndex]
						});
						$scope.$root && $scope.$root.$$phase || $scope.$apply();
					}

                    pRect = $placeholder[0].getBoundingClientRect();
                    pCenter = {
                        x: ~~(pRect.left + pRect.width/2),
                        y: ~~(pRect.top + pRect.height/2)
                    };
                    sortingInProgress = true;
                    candidates = [];

					// ----- move the element
					$helper[0].reposition({
						x: mouse.x + body.scrollLeft - mouse.offset.x * svRect.width,
						y: mouse.y + body.scrollTop - mouse.offset.y * svRect.height
					}, containmentRect);

					// ----- manage candidates
					getSortableElements(mapKey).forEach(function(se, index){
						if(opts.containment != null){
							// TODO: optimize this since it could be calculated only once when the moving begins
							if(
								!elementMatchesSelector(se.element, opts.containment) &&
								!elementMatchesSelector(se.element, opts.containment + ' *')
							) return; // element is not within allowed containment
						}
						var rect = se.element[0].getBoundingClientRect();
						var center = {
							x: ~~(rect.left + rect.width/2),
							y: ~~(rect.top + rect.height/2)
						};
						if(!se.container && // not the container element
							(se.element[0].scrollHeight || se.element[0].scrollWidth)){ // element is visible
							candidates.push({
								element: se.element,
								q: (center.x - mouse.x)*(center.x - mouse.x) + (center.y - mouse.y)*(center.y - mouse.y),
								view: se.getPart(),
								targetIndex: se.getIndex(),
								after: shouldBeAfter(center, mouse, isGrid)
							});
						}
						if(se.container && !se.element[0].querySelector('[sv-element]:not(.sv-placeholder):not(.sv-source)')){ // empty container
							candidates.push({
								element: se.element,
								q: (center.x - mouse.x)*(center.x - mouse.x) + (center.y - mouse.y)*(center.y - mouse.y),
								view: se.getPart(),
								targetIndex: 0,
								container: true
							});
						}
					});
					candidates.push({
						q: (pCenter.x - mouse.x)*(pCenter.x - mouse.x) + (pCenter.y - mouse.y)*(pCenter.y - mouse.y),
						element: $placeholder,
						placeholder: true
					});
					candidates.sort(function(a, b){
						return a.q - b.q;
					});

					candidates.forEach(function(cand, index){
						if (index === 0 && !cand.placeholder && !cand.container) {
							$target = cand;
							cand.element.addClass('sv-candidate');
							if(cand.after)
								cand.element.after($placeholder);
							else
								insertElementBefore(cand.element, $placeholder);
						}
						else if(index === 0 && cand.container) {
							$target = cand;
							cand.element.append($placeholder);
						}
						else {
                            cand.element.removeClass('sv-candidate');
                        }
					});

                    if (scrollBoundTop >= svRect.top) {
                        isScrolling = true;
                        scroll(-5, 200);
                    }
                    else if (scrollBoundBottom <= svRect.bottom) {
                        isScrolling = true;
                        scroll(5, 200);
                    } else {
                        isScrolling = false;
                    }
				};

				this.$drop = function(originatingPart, index, options){
					if(!$placeholder) return;

					if(options.revert){
						var placeholderRect = $placeholder[0].getBoundingClientRect();
						var helperRect = $helper[0].getBoundingClientRect();
						var distance = Math.sqrt(
							Math.pow(helperRect.top - placeholderRect.top, 2) +
							Math.pow(helperRect.left - placeholderRect.left, 2)
						);

						var duration = +options.revert*distance/200; // constant speed: duration depends on distance
						duration = Math.min(duration, +options.revert); // however it's not longer that options.revert

						['-webkit-', '-moz-', '-ms-', '-o-', ''].forEach(function(prefix){
							if(typeof $helper[0].style[prefix + 'transition'] !== "undefined")
								$helper[0].style[prefix + 'transition'] = 'all ' + duration + 'ms ease';
						});
						setTimeout(afterRevert, duration);
						$helper.css({
							'top': placeholderRect.top + body.scrollTop + 'px',
							'left': placeholderRect.left + body.scrollLeft + 'px'
						});
					}
					else
						afterRevert();

					function afterRevert(){
						sortingInProgress = false;
						$placeholder.remove();
						$helper.remove();
						$original.removeClass('ng-hide');

						candidates = void 0;
						$placeholder = void 0;
						options = void 0;
						$helper = void 0;
						$original = void 0;

						// sv-on-stop callback
						onStop($scope, {
							$part: originatingPart.model(originatingPart.scope),
							$index: index,
							$item: originatingPart.model(originatingPart.scope)[index]
						});

						if ($target) {
							$target.element.removeClass('sv-candidate');
							var spliced = originatingPart.model(originatingPart.scope).splice(index, 1);
							var targetIndex = $target.targetIndex;

							if($target.view === originatingPart && $target.targetIndex > index) {
                                targetIndex--;
                            }

							if($target.after) {
                                targetIndex++;
                            }

							$target.view.model($target.view.scope).splice(targetIndex, 0, spliced[0]);

							// sv-on-sort callback
							if($target.view !== originatingPart || index !== targetIndex) {
                                onSort($scope, {
                                    $partTo: $target.view.model($target.view.scope),
                                    $partFrom: originatingPart.model(originatingPart.scope),
                                    $item: spliced[0],
                                    $indexTo: targetIndex,
                                    $indexFrom: index
                                });
                            }
						}
						$target = void 0;

						$scope.$root && $scope.$root.$$phase || $scope.$apply();
					}
				};

				this.addToSortableElements = function(se){
					getSortableElements(mapKey).push(se);
				};
				this.removeFromSortableElements = function(se){
					var elems = getSortableElements(mapKey);
					var index = elems.indexOf(se);
					if(index > -1){
						elems.splice(index, 1);
						if(elems.length === 0) {
                            removeSortableElements(mapKey);
                        }
					}
				};
			}]
		};
	}]);

	module.directive('svPart', ['$parse', function($parse){
		return {
			restrict: 'A',
			require: '^svRoot',
			controller: ['$scope', function($scope){
				$scope.$ctrl = this;
				this.getPart = function(){
					return $scope.part;
				};
				this.$drop = function(index, options){
					$scope.$sortableRoot.$drop($scope.part, index, options);
				};
			}],
			scope: true,
			link: function($scope, $element, $attrs, $sortable){
				if (!$attrs.svPart) {
				    throw new Error('no model provided');
                }

				var model = $parse($attrs.svPart);
				if (!model.assign) {
				    throw new Error('model not assignable');
                }

				$scope.part = {
					id: $scope.$id,
					element: $element,
					model: model,
					scope: $scope
				};
				$scope.$sortableRoot = $sortable;

				var sortablePart = {
					element: $element,
					getPart: $scope.$ctrl.getPart,
					container: true
				};
				$sortable.addToSortableElements(sortablePart);
				$scope.$on('$destroy', function(){
					$sortable.removeFromSortableElements(sortablePart);
				});
			}
		};
	}]);

	module.directive('svElement', ['$parse', function($parse){
		return {
			restrict: 'A',
			require: ['^svPart', '^svRoot'],
			controller: ['$scope', function($scope){
				$scope.$ctrl = this;
			}],
			link: function($scope, $element, $attrs, $controllers){
                var body = document.body;
			    var touchEndEvents = 'touchend touchcancel';
                var endEvents = 'mouseup ' + touchEndEvents;
                var moveEvents = 'mousemove touchmove';

                var handle = $element;
				var sortableElement = {
					element: $element,
					getPart: $controllers[0].getPart,
					getIndex: function(){
						return $scope.$index;
					}
				};
				var isDestroyed = false;
                var html = angular.element(document.documentElement);

                var moveExecuted;
                var helper;
                var placeholder;

                function cleanupStartEvents() {
                    handle.off('touchstart', onTouchStart);
                    handle.off('mousedown', onMouseDown);
                }

				$controllers[1].addToSortableElements(sortableElement);
				$scope.$on('$destroy', function(){
                    isDestroyed = true;
                    cleanupStartEvents();
					$controllers[1].removeFromSortableElements(sortableElement);
				});

				handle.on('touchstart', onTouchStart);
                handle.on('mousedown', onMouseDown);

				$scope.$watch('$ctrl.handle', function(customHandle){
					if(customHandle){
                        cleanupStartEvents();

						handle = customHandle;

                        handle.on('touchstart', onTouchStart);
                        handle.on('mousedown', onMouseDown);
					}
				});

				$scope.$watch('$ctrl.helper', function(customHelper){
					if(customHelper){
						helper = customHelper;
					}
				});

				$scope.$watch('$ctrl.placeholder', function(customPlaceholder){
					if(customPlaceholder){
						placeholder = customPlaceholder;
					}
				});

                function onTouchStart(e){
                    var cancelEvents = moveEvents + ' ' + endEvents;

                    function switchToMousedown() {
                        cancel();
                        onMouseDown(e, true);
                    }

                    function cancel(e) {
                        clearTimeout(switchTimer);
                        html.off(cancelEvents, cancel);
                    }

                    var switchTimer;

                    html.on('touchmove ' + touchEndEvents, cancel);

                    switchTimer = setTimeout(switchToMousedown, 200);
                }

				function onMouseDown(e, runMouseMoveHandler) {
					touchFix(e);

					if($controllers[1].sortingInProgress()) {
					    return;
                    }

					if(e.button != 0 && e.type === 'mousedown') {
					    return;
                    }

                    var target = $element;
                    var clientRect = $element[0].getBoundingClientRect();
                    var opts = $parse($attrs.svElement)($scope);
                    var pointerOffset = {
                        x: (e.clientX - clientRect.left) / clientRect.width,
                        y: (e.clientY - clientRect.top) / clientRect.height
                    };
                    var clone;

					moveExecuted = false;

					opts = angular.extend({}, {
						tolerance: 'pointer',
						revert: 200,
						containment: 'html'
					}, opts);


					if(!helper) {
					    helper = $controllers[0].helper;
                    }

					if(!placeholder) {
					    placeholder = $controllers[0].placeholder;
                    }

					if(helper){
						clone = helper.clone();
						clone.removeClass('ng-hide');
						clone.css({
							'left': clientRect.left + body.scrollLeft + 'px',
							'top': clientRect.top + body.scrollTop + 'px'
						});
						target.addClass('sv-visibility-hidden');
					}
					else{
						clone = target.clone();
						clone.addClass('sv-helper').css({
							'left': clientRect.left + body.scrollLeft + 'px',
							'top': clientRect.top + body.scrollTop + 'px',
							'width': clientRect.width + 'px'
						});
					}

					clone[0].reposition = function(coords, containmentRect) {
						var targetLeft = coords.x;
						var targetTop = coords.y;
						var helperRect = clone[0].getBoundingClientRect();

						if (containmentRect) {
                            targetTop = Math.max(targetTop, containmentRect.top + body.scrollTop);// top boundary

							if (targetTop + helperRect.height > containmentRect.top + body.scrollTop + containmentRect.height) // bottom boundary
								targetTop = containmentRect.top + body.scrollTop + containmentRect.height - helperRect.height;

                            targetLeft = Math.max(targetLeft, containmentRect.left + body.scrollLeft); // left boundary

							if (targetLeft + helperRect.width > containmentRect.left + body.scrollLeft + containmentRect.width) // right boundary
								targetLeft = containmentRect.left + body.scrollLeft + containmentRect.width - helperRect.width;
						}
						this.style.left = targetLeft - body.scrollLeft + 'px';
						this.style.top = targetTop - body.scrollTop + 'px';
					};

					html.addClass('sv-sorting-in-progress');
					html.on(moveEvents, onMousemove).on(endEvents, onMouseup);

                    function onMouseup(e){
                        html.off(moveEvents, onMousemove);
                        html.off(endEvents, onMouseup);
                        html.removeClass('sv-sorting-in-progress');
                        if(moveExecuted){
                            $controllers[0].$drop($scope.$index, opts);
                        }
                        $element.removeClass('sv-visibility-hidden');
                    }

					function onMousemove(e){
						touchFix(e);

						if (!moveExecuted) {
							$element.parent().prepend(clone);
							moveExecuted = true;
						}

						$controllers[1].$moveUpdate(opts, {
							x: e.clientX,
							y: e.clientY,
							offset: pointerOffset
						}, clone, $element, placeholder, $controllers[0].getPart(), $scope.$index);
					}

					if (runMouseMoveHandler) {
                        onMousemove(e);
                    }
				}
			}
		};
	}]);

	module.directive('svHandle', function(){
		return {
			require: '?^svElement',
			link: function($scope, $element, $attrs, $ctrl){
				if($ctrl) {
                    $ctrl.handle = jqAdd.call($element, $ctrl.handle); // support multiple handles
                }
			}
		};
	});

	module.directive('svHelper', function(){
		return {
			require: ['?^svPart', '?^svElement'],
			link: function($scope, $element, $attrs, $ctrl){
				$element.addClass('sv-helper').addClass('ng-hide');
				if($ctrl[1]) {
                    $ctrl[1].helper = $element;
                }
				else if($ctrl[0]) {
                    $ctrl[0].helper = $element;
                }
			}
		};
	});

	module.directive('svPlaceholder', function(){
		return {
			require: ['?^svPart', '?^svElement'],
			link: function($scope, $element, $attrs, $ctrl){
				$element.addClass('sv-placeholder').addClass('ng-hide');
				if($ctrl[1]) {
                    $ctrl[1].placeholder = $element;
                }
				else if($ctrl[0]) {
                    $ctrl[0].placeholder = $element;
                }
			}
		};
	});
})(window, window.angular);
