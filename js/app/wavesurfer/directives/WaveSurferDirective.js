'use strict';
angular.module('WaveSurferDirective', []).value('myWaveSurferConfig', {}).directive('myWaveSurfer', ['myWaveSurferConfig', 'UtilsFactory', 'WaveSurferFactory',
    function(myWaveSurferConfig, UtilsFactory, WaveSurferFactory) {
        //console.log('dir called');
        //var wavesurfer = Object.create(WaveSurfer);
        var maxZoom = 100;
        var minZoom = 13;
        var zoomGap = 1;
        var timeline;
        // Set some default options
        var options = {
            waveColor: 'lightgrey',
            progressColor: 'black',
            loaderColor: 'purple',
            cursorColor: 'navy',
            markerWidth: 2,
            minPxPerSec: minZoom,
            selectionColor: 'rgba(255,0,0, .2)',
            selectionForeground: true,
            selectionBorderColor: '#d42929',
            selectionBorder: true,
            interact: true,
            loopSelection: false
        };

        myWaveSurferConfig = myWaveSurferConfig || {};
        // Merge default config with user config
        angular.extend(options, myWaveSurferConfig);
        return {
            restrict: "A",
            scope: {
                myFile: '=file',
                waveSurfer: '=instance'
            }, // isolated scope
            link: function($scope, el, attrs) {
                $scope.$emit('wsLoading');
                $scope.playMode = 'normal';
                $scope.loop = false;

                var $container = document.querySelector('#waveform');
                options.container = $container;

                // Wavesurfer Progress bar
                var progressDiv = document.querySelector('#progress-bar');
                var progressBar = progressDiv.querySelector('.progress-bar');
                if (!$scope.waveSurfer) {
                    $scope.waveSurfer = Object.create(WaveSurfer);
                    $scope.waveSurfer.init(options);
                } else {
                    if ($scope.waveSurfer.markers)
                        $scope.waveSurfer.clearMarks();
                }
                $scope.waveSurfer.load($scope.myFile.url);
                $scope.waveSurfer.on('loading', function(percent, xhr) {
                    progressDiv.style.display = 'block';
                    progressBar.style.width = percent + '%';
                });
                // Won't work on iOS until you touch the page
                $scope.waveSurfer.on('ready', function() {
                    progressDiv.style.display = 'none';
                    // TIMELINE
                    // avoid creating timeline object twice (after uploading a new file for example)
                    if (timeline) {
                        $('#wave-timeline wave').remove();
                    } else {
                        // create timeline object
                        timeline = Object.create(WaveSurfer.Timeline);
                    }
                    timeline.init({
                        wavesurfer: $scope.waveSurfer,
                        container: '#wave-timeline'
                    });
                    $scope.time = UtilsFactory.secondsToHms($scope.waveSurfer.backend.getCurrentTime());
                    $scope.$emit('wsLoaded', $scope.waveSurfer);
                });
                // listen to progress event
                $scope.waveSurfer.on('progress', function() {
                    // surround the call with setTimeout to avoid that : https://docs.angularjs.org/error/$rootScope/inprog
                    window.setTimeout(function() {
                        $scope.$apply(function() {
                            $scope.time = UtilsFactory.secondsToHms($scope.waveSurfer.backend.getCurrentTime());
                        });
                    }, 0);
                });

                progressDiv.style.display = 'none';
            },
            templateUrl: 'js/app/wavesurfer/partials/wave.html',
            controller: ['$scope',
                function($scope) {
                    // 'public' methods (callable from wiew)
                    
                    // play / pause method
                    $scope.play = function() {
                        // pause if playing (call "pause")
                        if (!$scope.waveSurfer.backend.isPaused()) {
                            $scope.waveSurfer.playPause();
                        }
                        // call "play"
                        else {

                            $scope.duration = $scope.waveSurfer.backend.getDuration();

                            if ($scope.playMode === 'normal') {                                
                                if ($scope.loop) {
                                    console.log('normal loop');
                                    playNormalLoop($scope.waveSurfer.backend.getCurrentTime());
                                } else {
                                    console.log('normal');
                                    $scope.waveSurfer.playPause();
                                }
                            }
                            else if ($scope.playMode === 'segment') {

                                // without looping option work perfectly
                                var prevMarker = WaveSurferFactory.getPreviousMarker($scope.waveSurfer.markers, $scope.waveSurfer.backend.getCurrentTime());
                                var start = prevMarker ? prevMarker.position : 0;
                                var nextMarker = WaveSurferFactory.getNextMarker($scope.waveSurfer.markers, $scope.waveSurfer.backend.getCurrentTime(), $scope.duration);
                                var end = nextMarker ? nextMarker.position : $scope.duration;
                                $scope.waveSurfer.play($scope.waveSurfer.backend.getCurrentTime(), end);

                                // listen to progress in order to replay if needed
                                if ($scope.loop) {
                                    $scope.waveSurfer.on('progress', function() {
                                        if ($scope.waveSurfer.backend.getCurrentTime().toFixed(1) >= end.toFixed(1)) {
                                            $scope.waveSurfer.play(start, end);
                                        }
                                    });
                                }
                            }
                            else if ($scope.playMode === 'backward') {

                                var prevMarker = WaveSurferFactory.getPreviousMarker($scope.waveSurfer.markers, $scope.duration);
                                //console.log($scope.prevMarker);
                                if (prevMarker) {
                                    playBackwardBuilding(prevMarker.position);
                                }
                                else {
                                    $scope.waveSurfer.seekTo(0);
                                    $scope.waveSurfer.play();
                                }
                            }
                        }
                    };
                    // go to previous marker
                    $scope.back = function() {
                        WaveSurferFactory.moveBackward($scope.waveSurfer);
                    };
                    // go to next marker
                    $scope.forth = function() {
                        WaveSurferFactory.moveForward($scope.waveSurfer);
                    };
                    $scope.zoomIn = function() {
                        if ($scope.waveSurfer.minPxPerSec < maxZoom) {
                            if (!$scope.waveSurfer.params.scrollParent)
                                $scope.waveSurfer.toggleScroll();
                            $scope.waveSurfer.params.minPxPerSec += zoomGap;
                            $scope.waveSurfer.minPxPerSec += zoomGap;
                            $scope.waveSurfer.drawBuffer();
                        }
                    };
                    $scope.zoomOut = function() {
                        if ($scope.waveSurfer.minPxPerSec > minZoom) {
                            if (!$scope.waveSurfer.params.scrollParent)
                                $scope.waveSurfer.toggleScroll();
                            $scope.waveSurfer.params.minPxPerSec -= zoomGap;
                            $scope.waveSurfer.minPxPerSec -= zoomGap;
                            $scope.waveSurfer.drawBuffer();
                        }
                        else {
                            if ($scope.waveSurfer.params.scrollParent)
                                $scope.waveSurfer.toggleScroll();
                            $scope.waveSurfer.params.minPxPerSec = minZoom;
                            $scope.waveSurfer.minPxPerSec = minZoom;
                            $scope.waveSurfer.drawBuffer();
                        }
                    };
                    $scope.changeSpeed = function(e) {
                        var value = e.target.dataset && e.target.dataset.value;
                        if (value) {
                            $scope.waveSurfer.playPause();
                            $scope.waveSurfer.backend.setPlaybackRate(value);
                            $scope.waveSurfer.playPause();
                        }
                    };
                    /**
                     * Change playback mode
                     * We need to handle on the fly (while playing / marker changes...) playing mode switching
                     * @param {Event} e
                     */
                    $scope.togglePlayMode = function(e) {
                        // pause playing if necessary so that play method does not pause playing
                        if (!$scope.waveSurfer.backend.isPaused()) {
                            console.log();
                            $scope.waveSurfer.playPause();
                        }
                        var value = e.target.dataset && e.target.dataset.value;
                        if (value) {
                            $scope.playMode = value;
                        } else {
                            // default play mode
                            $scope.playMode = 'normal';
                        }
                        $scope.play();
                    };
                    $scope.mark = function() {
                        $scope.waveSurfer.mark({
                            color: 'rgba(255, 0, 0, 1)',
                            id: UtilsFactory.generateUUID(),
                            type: 'teacher',
                            draggable: true
                        });
                    };
                    $scope.toggleLoop = function() {                        
                        $scope.loop = !$scope.loop;
                        //$scope.play();
                    };

                    // 'private' methods
                    function playBackwardBuilding(currentStart) {

                        var last = false;
                        // play first time from given start
                        $scope.waveSurfer.play(currentStart, $scope.duration);

                        // when reaching the end
                        $scope.waveSurfer.on('finish', function() {

                            console.log('finish');
                            // get new start (previous marker position)
                            var prevMarker = WaveSurferFactory.getPreviousMarker($scope.waveSurfer.markers, currentStart);

                            if (prevMarker) {
                                console.log('1');
                                // recursively call the method with new start
                                playBackwardBuilding(prevMarker.position);
                            }
                            // if no prev marker and not the last call wavesurfer play method
                            else if (!last) {
                                console.log('2');
                                // now it is the last we dont call the récursive method
                                last = true;
                                // pause playback if playing (to be sure)
                                if (!$scope.waveSurfer.backend.isPaused()) {
                                    console.log('3');
                                    $scope.waveSurfer.playPause();
                                }
                                // play the entire file
                                $scope.waveSurfer.seekTo(0);
                                $scope.waveSurfer.playPause();
                            }
                            console.log('last ' + last + ' loop ' + $scope.loop);
                        });
                    }

                    // loop the entire file
                    function playNormalLoop(currentStart) {
                        console.log('playNormalLoop :: currentStart ' + currentStart + ' duration ' + $scope.duration );
                        $scope.waveSurfer.play(currentStart,  $scope.duration);
                        $scope.waveSurfer.on('finish', function() {
                            if ($scope.loop)
                                playNormalLoop(0);
                        });
                    }
                }
            ]
        };
    }
]);