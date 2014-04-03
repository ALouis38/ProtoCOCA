'use strict';

// wavesurfer instance
var wavesurfer = Object.create(WaveSurfer);
// wavesurfer timeline
var timeline;

// Utils instance
var appUtils = new Utils();

var isStudent = false;

// wavesurfer sound load progress bar
var progressDiv;

// segments for the file
var segments = [];

// audio file url
var currentAudioUrl = 'media/demo_jpp.mp3';
var currentAudioId;

var options;

var maxZoom = 50;
var minZoom = 13;

// existing segment collection list
var sCList = [];

// are we creating a new segment collection from scratch ?
var isEditing = false;
// if editing this is the current colection edited
var curCollection;

// Init & load audio file
document.addEventListener('DOMContentLoaded', function() {
    initUI();
    options = {
        container: document.querySelector('#waveform'),
        waveColor: 'lightgrey',
        progressColor: 'black',
        loaderColor: 'purple',
        cursorColor: 'navy',
        markerWidth: 1,
        minPxPerSec: minZoom
    };

    // Wavesurfer Progress bar
    progressDiv = document.querySelector('#progress-bar');
    var progressBar = progressDiv.querySelector('.progress-bar');

    wavesurfer.on('loading', function(percent, xhr) {
        progressDiv.style.display = 'block';
        progressBar.style.width = percent + '%';
    });

    // Won't work on iOS until you touch the page
    wavesurfer.on('ready', function() {
        progressDiv.style.display = 'none';
        // init time-text with current time
        $('#time').text(appUtils.secondsToHms(wavesurfer.backend.getCurrentTime()));

        // TIMELINE
        // avoid creating timeline object twice (after drag&drop for example)
        if (timeline) {
            $('#wave-timeline wave').remove();
        }
        else {
            // create timeline object
            timeline = Object.create(WaveSurfer.Timeline);
        }

        timeline.init({
            wavesurfer: wavesurfer,
            container: '#wave-timeline'
        });
        
        if(isEditing){
            drawMarkerCollection(segments);
        }
        
    });

    // listen to progress event
    wavesurfer.on('progress', function() {
        $('#time').text(appUtils.secondsToHms(wavesurfer.backend.getCurrentTime()));
    });
    // hide wavesurfer progress bar
    progressDiv.style.display = 'none';
});



// Bind buttons and keypresses
(function() {
    var eventHandlers = {
        'play': function() {
            wavesurfer.playPause();
        },
        'green-mark': function() {
            var id = appUtils.generateUUID();
            var time = appUtils.secondsToHms(wavesurfer.backend.getCurrentTime());
            var wsTime = wavesurfer.backend.getCurrentTime();
            addStudentComment(wsTime, time, id);

            wavesurfer.mark({
                color: 'rgba(0, 255, 0, 1)',
                id: id
            });

        },
        // Add a marker and add/update segments
        'red-mark': function() {
            // check if no other marker already exists at the same position
            var position = wavesurfer.backend.getCurrentTime();
            var alertMsg = '';

            if (!appUtils.checkNewMarkerPosition(wavesurfer.markers, position)) {
                alertMsg += '<p class="alert">';
                alertMsg += '   A marker already exists at the same position !';
                alertMsg += '</p>';
                bootbox.alert(alertMsg);
            }
            else {
                var newMId = appUtils.generateUUID();
                // update segments concerned by the new marker if any
                if (segments.length > 0) {
                    // find corresponding segment                    
                    var segment = appUtils.getSegmentByCurrentPosition(position, segments);
                    if (segment) {
                        // find segment index in order to delete it and insert the two new segments at the right place
                        var sIndex = appUtils.getSegmentIndexById(segment.id, segments);
                        // find name and comment of the existing segment from html
                        var name = $('#' + segment.id + '-name').val();
                        var comment = $('#' + segment.id + '-comment').val();
                        // create two new segments
                        var firstS = new Segment();
                        firstS.init(
                                appUtils.generateUUID(),
                                currentAudioUrl,
                                currentAudioId,
                                name,
                                comment,
                                segment.start,
                                segment.mStartId,
                                position,
                                newMId
                                );

                        var secondS = new Segment();
                        secondS.init(
                                appUtils.generateUUID(),
                                currentAudioUrl,
                                currentAudioId,
                                '',
                                '',
                                position,
                                newMId,
                                segment.end,
                                segment.mEndId
                                );
                        // insert the two new segments in the collection (at the good index) and remove the old one 
                        segments.splice(sIndex, 1, firstS, secondS);
                        // create new wavesurfer marker
                        wavesurfer.mark({
                            color: 'rgba(255, 0, 0, 1)',
                            id: newMId,
                            type: 'teacher'
                        });

                        // redraw segments
                        showSegments(segments);
                    }
                    else {
                        console.log('Error - No segment found');
                    }
                }
                else {
                    wavesurfer.mark({
                        color: 'rgba(255, 0, 0, 1)',
                        id: newMId,
                        type: 'teacher'
                    });
                }
                toggleSegmentButtons();
            }
        },
        // go to previous marker
        'back': function() {
            moveBackward();
        },
        // go to next marker
        'forth': function() {
            moveForward();
        },
        'delete-marks': function() {
            // depending on who i am (student or teacher) only remove red or green markers
            Object.keys(wavesurfer.markers).forEach(function(id) {
                var marker = wavesurfer.markers[id];
                var type = marker.type;
                // green markers
                if ('student' === type && isStudent) {
                    wavesurfer.markers[id].remove();
                }
                else if ('teacher' === type && !isStudent) {
                    wavesurfer.markers[id].remove();
                }
                wavesurfer.redrawMarks();
            });
            // also delete li(s) in DOM
            if (isStudent)
                $('#student-comments > li').remove();
            else
                $('#teacher-comments > li').remove();
        },
        'change-speed': function(e) {
            var value = e.target.dataset && e.target.dataset.value;
            wavesurfer.playPause();
            wavesurfer.backend.setPlaybackRate(value);
            wavesurfer.playPause();
        },
        // automatically add markers to the waveform
        // TODO add marker depending on silence found in file
        'auto-draw-markers': function() {
            autoDrawMarkers();
            $("#create-segments").prop('disabled', false);
            $("#auto-draw").prop('disabled', true);
        },
        // create segments depending on markers
        'create-segments': function() {
            if (appUtils.countMarkers(wavesurfer.markers)) {
                createSegments(wavesurfer.markers);
                showSegments(segments);
                toggleSegmentButtons();
            }
            else {
                var alertMsg = '';
                alertMsg += '<p class="alert">';
                alertMsg += '   No marker drawn. Can not create segments!';
                alertMsg += '</p>';
                bootbox.alert(alertMsg);
            }
        },
        // create audio files for each segment
        'create-files-from-segments': function() {
            splitAudio(currentAudioUrl, segments);
        },
        'save-all-segments': function() {
            var content = '';
            content += '<div class="row">';
            content += '    <div class="col-md-12">';
            content += '        <input type="text" name="scname" id="scoll-name" value="">';
            content += '    </div>';
            content += '</div>';
            bootbox.dialog({
                message: content,
                title: "Pick a name for the segment collection",
                buttons: {
                    cancel: {
                        label: "Cancel",
                        className: "btn-default"
                    },
                    main: {
                        label: "OK",
                        className: "name-ok btn-primary",
                        callback: function() {
                            var name = $('#scoll-name').val();
                            if (name) {
                                saveSegmentCollection(name);
                            }
                        }
                    }
                }
            });
            // disable OK button while no file selected
            if (isEditing) {
                $('#scoll-name').val(curCollection.name);
            }
            else {
                $('.name-ok').prop('disabled', true);
            }
            $('#scoll-name').keyup(function() {
                if ($('#scoll-name').val()) {
                    $('.name-ok').prop('disabled', false);
                }
                else {
                    $('.name-ok').prop('disabled', true);
                }
            });

        },
        'delete-all-segments': function(sender) {
            var confirmMsg = '';
            confirmMsg += '<p class="confirm">';
            confirmMsg += ' Are you sure you want to delete all segments ?';
            confirmMsg += '</p>';
            bootbox.confirm(confirmMsg, function(result) {
                if (result) {
                    initSegmentsAndMarkers();
                }
            });
        },
        // delete a segment and update IHM
        'delete-segment': function(sender) {
            var confirmMsg = '';
            confirmMsg += '<p class="confirm">';
            confirmMsg += ' Are you sure you want to delete this segment ?';
            confirmMsg += '</p>';
            bootbox.confirm(confirmMsg, function(result) {
                if (result) {
                    // segment id
                    var sId = $(sender.target).parents("li").attr("id");
                    var segment = appUtils.getSegmentById(sId, segments);
                    var sIndex = appUtils.getSegmentIndexById(sId, segments);
                    if (segment) {
                        segments = appUtils.mergeSegments(segment, sIndex, segments, wavesurfer.markers);
                        // redraw segments
                        showSegments(segments);
                    }
                    else {
                        console.log('Error - segment not found');
                    }
                }
                toggleSegmentButtons();
            });
        },
        // move playing cursor to clicked marker time
        'move-cursor-to': function(sender) {
            var time = sender.target.dataset && sender.target.dataset.time;
            var delta = time - wavesurfer.backend.getCurrentTime();
            wavesurfer.skip(delta);
        },
        // move marker to current cursor time
        'move-to-current-time': function(sender) {
            var time = wavesurfer.backend.getCurrentTime();
            var mId = sender.target.dataset && sender.target.dataset.mid;
            var cMarker = wavesurfer.markers[mId];
            // can not move first or last segment
            if (appUtils.isFirstOrLastMarker(cMarker, wavesurfer.backend.getDuration())) {
                var alertMsg = '';
                alertMsg += '<p class="alert">';
                alertMsg += '   You can not move first or last marker!';
                alertMsg += '</p>';
                bootbox.alert(alertMsg);
            }
            else {
                // check that new position is between next and previous marker position
                if (appUtils.checkMarkerNewPosition(cMarker, time, wavesurfer.markers, wavesurfer.backend.getDuration())) {
                    // retrieve marker segment
                    var sId = $(sender.target).parents("li").attr("id");
                    var segment = appUtils.getSegmentById(sId, segments);
                    // retrieve segment index in collection 
                    var sIndex = appUtils.getSegmentIndexById(sId, segments);

                    // update segment
                    if (cMarker.position === segment.start) {
                        // find previous segment and update it's end
                        var prevS = appUtils.getPreviousSegment(segment, segments);
                        if (prevS) {
                            prevS.end = time;
                            var prevSIndex = appUtils.getSegmentIndexById(prevS.id, segments);
                            segments[prevSIndex] = prevS;
                        }
                        segment.start = time;
                    }
                    else if (cMarker.position === segment.end) {
                        // find next segment and update it's start
                        var nextS = appUtils.getNextSegment(segment, segments);
                        if (nextS) {
                            nextS.start = time;
                            var nextSIndex = appUtils.getSegmentIndexById(nextS.id, segments);
                            segments[nextSIndex] = nextS;
                        }
                        segment.end = time;
                    }
                    segments[sIndex] = segment;

                    // redraw segments
                    showSegments(segments);
                    // update marker position
                    updateMarker(time, mId);

                }
                else {
                    var alertMsg = '';
                    alertMsg += '<p class="alert">';
                    alertMsg += '   You can only move a marker between next or previous marker position of the current segment.';
                    alertMsg += '</p>';
                    bootbox.alert(alertMsg);
                }
            }
        },
        // delete clicked marker and update segments
        'delete-marker': function(sender) {
            var mId = sender.target.dataset && sender.target.dataset.mid;
            var cMarker = wavesurfer.markers[mId];
            if (appUtils.isFirstOrLastMarker(cMarker, wavesurfer.backend.getDuration())) {
                var alertMsg = '';
                alertMsg += '<p class="alert">';
                alertMsg += '   You can not move first or last marker!';
                alertMsg += '</p>';
                bootbox.alert(alertMsg);
            }
            else {
                var confirmMsg = '';
                confirmMsg += '<p class="confirm">';
                confirmMsg += ' If you delete this marker you will also delete the segment.';
                confirmMsg += '</p>';
                confirmMsg += '<p class="confirm">';
                confirmMsg += ' Are you sure you want to continue ?';
                confirmMsg += '</p>';
                bootbox.confirm(confirmMsg, function(result) {
                    if (result) {
                        // segment id
                        var sId = $(sender.target).parents("li").attr("id");
                        var segment = appUtils.getSegmentById(sId, segments);
                        var sIndex = appUtils.getSegmentIndexById(sId, segments);
                        if (segment) {
                            segments = appUtils.mergeSegments(segment, sIndex, segments, wavesurfer.markers);
                            // redraw segments
                            showSegments(segments);
                        }
                        else {
                            console.log('Error - segment not found');
                        }
                    }
                });
            }
        },
        'upload-file': function(sender) {
            var content = '';
            content += '<div class="row">';
            content += '    <div class="col-md-12">';
            content += '        <input type="file" id="myFile" accept="audio/mpeg">';
            content += '    </div>';
            content += '</div>';
            bootbox.dialog({
                message: content,
                title: "Choose a file to work on",
                buttons: {
                    cancel: {
                        label: "Cancel",
                        className: "btn-default"
                    },
                    main: {
                        label: "OK",
                        className: "file-ok btn-primary",
                        callback: function() {
                            var selected_file = $('#myFile').get(0).files[0];
                            if (selected_file) {
                                // upload file to media folder
                                uploadFile(selected_file.name, selected_file, 'media/');
                                initUI();
                            }
                        }
                    }
                }
            });
            // disable OK button while no file selected
            $('.file-ok').prop('disabled', true);
            $('#myFile').change(function() {
                $('.file-ok').prop('disabled', false);
            });
        },
        'open-project': function(sender) {
            // get existing collections
            var content = '';
            content += '<div class="row">';
            content += '    <div class="col-md-12">';
            content += '        <table id="pjct-table" class="table table-striped"k>';

            if (sCList.length > 0) {
                for (var i = 0; i < sCList.length; i++) {
                    var coll = JSON.parse(sCList[i]);
                    content += '<tr id="' + coll.id + '">';
                    content += '    <td class="text-center">';
                    content += '        <input type="radio" class="coll-select" name="collection" value="' + i + '"/>';
                    content += '    </td>';
                    content += '    <td>' + coll.name + '</td>';
                    content += '</tr>';
                }
            }
            else {
                content += '    <tr>';
                content += '        <td>';
                content += '            <h3>No existing collection</h3>';
                content += '        </td>';
                content += '    </tr>';
            }
            content += '        </table>';
            content += '    </div>';
            content += '</div>';


            bootbox.dialog({
                message: content,
                title: "Pick up an existing collection",
                buttons: {
                    cancel: {
                        label: "Cancel",
                        className: "btn-default"
                    },
                    main: {
                        label: "OK",
                        className: "pjct-ok btn-primary",
                        callback: function() {
                            var selected_index = $('input[name="collection"]:checked').val();
                            if (selected_index) {
                                curCollection = null; 
                                curCollection = JSON.parse(sCList[selected_index]);
                                isEditing = true;
                                drawSegmentCollection(curCollection);
                            }
                        }
                    }
                }
            });
            // disable OK button until a project is selected
            $('.pjct-ok').prop('disabled', true);
            $('input[name="collection"]').change(function() {
                $('.pjct-ok').prop('disabled', false);
            });
        },
        'zoom-in': function(sender) {
            if (wavesurfer.minPxPerSec < maxZoom) {
                wavesurfer.params.scrollParent = true;
                wavesurfer.minPxPerSec += 1;
                wavesurfer.params.minPxPerSec += 1;
                wavesurfer.drawBuffer();
            }
        },
        'zoom-out': function(sender) {
            if (wavesurfer.minPxPerSec > minZoom) {
                wavesurfer.params.scrollParent = true;
                wavesurfer.params.minPxPerSec -= 1;
                wavesurfer.minPxPerSec -= 1;
                wavesurfer.params.minPxPerSec -= 1;
                wavesurfer.drawBuffer();
            }
        },
        'init-screation': function(sender) {
            initSegmentsAndMarkers();
            initUI();
        }
    };

    // keyboard events
    document.addEventListener('keydown', function(e) {
        var map = {
            32: 'play', // space
            37: 'back', // left
            39: 'forth'       // right
        };
        if (e.keyCode in map) {
            var handler = eventHandlers[map[e.keyCode]];
            e.preventDefault();
            handler && handler(e);
        }
    });

    document.addEventListener('click', function(e) {
        var action = e.target.dataset && e.target.dataset.action;
        if (action && action in eventHandlers) {
            eventHandlers[action](e);
        }
    });
}());

// Flash mark when it's played over
wavesurfer.on('mark', function(marker) {
    if (marker.timer) {
        return;
    }

    marker.timer = setTimeout(function() {
        var origColor = marker.color;
        marker.update({color: 'yellow'});

        setTimeout(function() {
            marker.update({color: origColor});
            delete marker.timer;
        }, 100);
    }, 100);
});

wavesurfer.on('error', function(err) {
    console.error(err);
});


// FUNCTIONS
function updateMarker(time, mId) {

    wavesurfer.markers[mId].update({
        id: mId,
        position: time
    });
    wavesurfer.redrawMarks();
}

function addStudentComment(wsTime, time, id) {

    // insert new comment in the right place (between previous and next comment)

    // the li after wich we have to create the new comment
    var liBefore = null;
    // the li before wich we have to create the new comment
    var liAfter = null;

    $('#student-comments > li').each(function() {

        var cComment = $(this);
        var cTime = cComment.attr('data-time');
        if (cComment && wsTime > cTime) {
            var nComment = $(this).next();
            var nTime = nComment.attr('data-time');
            if (!nComment || nTime > wsTime) {
                // append new li here
                liBefore = cComment;
                return false;
            }
        }
        else if (wsTime < cTime) { // just on marker or we want to place the new comment before the first one
            liAfter = cComment;
            return false;
        }
    });

    var content = '<li data-time="' + wsTime + '" id="' + id + '" class="commment list-group-item">\n\
                    <div class="row">\n\
                        <div class="buttons col-md-4">\n\
                            <button type="button" class="btn btn-success btn-xs move-cursor-to" title="Move cursor to">\n\
                                <span class="glyphicon glyphicon-move"></span>\n\
                            </button>\n\
                            <button type="button" class="btn btn-primary btn-xs move-to-current-time" title="Move marker to current time">\n\
                                    <span class="glyphicon glyphicon-screenshot"></span>\n\
                            </button>\n\
                            <button type="button" class="btn btn-danger btn-xs remove" title="Delete marker">\n\
                                <span class="glyphicon glyphicon-trash"></span>\n\
                            </button>\n\
                        </div>\n\
                        <div class="col-md-4">\n\
                             <span class="time">' + time + '</span>\n\
                        </div>\n\
                        <div class="col-md-4">\n\
                            <label>Commentaire</label>\n\
                        </div>\n\
                        <textarea class="comment-text"></textarea>\n\
                    </div>\n\
                   </li>';

    // Happend to DOM
    if (null === liBefore && null === liAfter) {
        $('#student-comments').append(content);
    }
    else if (liBefore && null === liAfter) {
        $(liBefore).after(content);
    }
    else if (liAfter && null === liBefore) {
        $(liAfter).before(content);
    }
}
/**
 * move to :
 * - nearest previous marker (relatively to cursor position) if exists
 * - begining of the file if no marker 
 */
function moveBackward() {

    // get markers
    var markers = wavesurfer.markers;
    var currentTime = wavesurfer.backend.getCurrentTime();
    var delta = 0;

    if (appUtils.countMarkers(markers) > 0) {
        var prevMarker = appUtils.getPreviousMarker(markers, currentTime);
        if (prevMarker) {
            delta = prevMarker.position - wavesurfer.backend.getCurrentTime();
            wavesurfer.skip(delta);
        }
    }
    else {
        wavesurfer.seekTo(0);
    }
}

/**
 * move to :
 * - nearest next marker (relatively to cursor position) if exists
 * - end of the file if no marker 
 */
function moveForward() {

    // get markers
    var markers = wavesurfer.markers;
    var currentTime = wavesurfer.backend.getCurrentTime();
    var end = wavesurfer.backend.getDuration();
    var delta = 0;

    // if markers
    if (appUtils.countMarkers(markers) > 0) {
        var nextMarker = appUtils.getNextMarker(markers, currentTime, end);
        if (nextMarker) {
            delta = nextMarker.position - wavesurfer.backend.getCurrentTime();
        }
        else {
            delta = end - wavesurfer.backend.getCurrentTime();
        }
    }
    else {
        delta = end - wavesurfer.backend.getCurrentTime();
    }
    wavesurfer.skip(delta);
}

/**
 * Initialize segments with wavesurfer markers
 * @param {object} markers wavesurfer markers
 * @returns {undefined}
 */
function createSegments(markers) {

    var duration = wavesurfer.backend.getDuration();
    // if no marker at beginning add it
    if (appUtils.checkNewMarkerPosition(markers, 0)) {
        var id = appUtils.generateUUID();
        wavesurfer.mark({
            color: 'rgba(255, 0, 0, 1)',
            id: id,
            type: 'teacher',
            position: 0
        });
    }

    // if no marker at the end ad it
    if (appUtils.checkNewMarkerPosition(markers, duration)) {
        var id = appUtils.generateUUID();
        wavesurfer.mark({
            color: 'rgba(255, 0, 0, 1)',
            id: id,
            type: 'teacher',
            position: duration
        });
    }

    var sStart = 0;
    var sEnd;
    // sort markers by position
    var sortedMarkers = appUtils.getSortedMarkersArray(markers);
    for (var index in sortedMarkers) {
        // get next marker position
        var nMarker = appUtils.getNextMarker(markers, sStart, duration);
        var segment = new Segment();
        if (nMarker) {
            sEnd = nMarker.position;
            segment.init(appUtils.generateUUID(), currentAudioUrl, currentAudioId, '', '', sStart, sortedMarkers[index].id, sEnd, nMarker.id);
            segments.push(segment);
            sStart = sEnd;
        }
    }
}

function showSegments(_segments) {

    $('#segments li').remove();

    for (var i = 0; i < _segments.length; i++) {
        var s = _segments[i];
        var li = '';
        li += '<li data-start="' + s.start + '" data-end="' + s.end + '" data-mendid="' + s.mEndId + '" data-mstartid="' + s.mStartId + '" id="' + s.id + '" class="segment list-group-item">';
        // NAME + DELETE SEGMENT ROW
        li += ' <div class="row">';
        li += '     <div class="col-md-10">';
        //li += '         <label> Nom du segment : </label> <input type="text" name="sName" id="' + s.id + '-name" value="' + s.name + '" />';
        if(isEditing)
            li += '         <label>Segment : </label> <input type="text" name="sName" id="' + s.id + '-name" value="' + s.name + '" />';
        else
            li += '         <label>Segment : </label> <input type="text" name="sName" id="' + s.id + '-name" value="' + i + '_' + s.fUrl.split('/')[1].split('.')[0] + '" />';
        li += '     </div>';
        li += '     <div class="col-md-2">';
        li += '         <button type="button" class="btn btn-danger btn-xs" data-action="delete-segment" title="Delete segment">';
        li += '             <span class="glyphicon glyphicon-trash" data-action="delete-segment"></span> ';
        li += '         </button>';
        li += '     </div>';
        li += ' </div>';
        li += ' <hr/>';
        // SEGMENT + MARKERS INFOS ROW
        li += ' <div class="row">';
        li += '     <div class="col-md-8">';
        // START MARKER ROW
        li += '         <div class="row marker-info">';
        li += '             <div class="buttons col-md-12">';
        li += '                 <button type="button" class="btn btn-success btn-xs" data-time="' + s.start + '" data-action="move-cursor-to" title="Move cursor to">';
        li += '                     <span class="glyphicon glyphicon-move" data-action="move-cursor-to" data-time="' + s.start + '"></span>';
        li += '                 </button>';
        li += '                 <button type="button" class="btn btn-primary btn-xs" data-time="' + s.start + '" data-mid="' + s.mStartId + '"  data-action="move-to-current-time" title="Move marker to current time">';
        li += '                     <span class="glyphicon glyphicon-screenshot" data-action="move-to-current-time" data-time="' + s.start + '" data-mid="' + s.mStartId + '" ></span>';
        li += '                 </button>';
        li += '                 <button type="button" class="btn btn-danger btn-xs" data-mid="' + s.mStartId + '" data-action="delete-marker" title="Delete marker">';
        li += '                     <span class="glyphicon glyphicon-trash" data-action="delete-marker" data-mid="' + s.mStartId + '"></span>';
        li += '                 </button>';
        li += '                 <span class="time"> ' + appUtils.secondsToHms(s.start) + '</span>';
        li += '             </div>';
        li += '         </div>';
        // MARKER 2 ROW
        li += '         <div class="row marker-info">';
        li += '             <div class="buttons col-md-12">';
        li += '                 <button type="button" class="btn btn-success btn-xs" data-time="' + s.end + '" data-action="move-cursor-to" title="Move cursor to">';
        li += '                     <span class="glyphicon glyphicon-move" data-action="move-cursor-to" data-time="' + s.end + '"></span>';
        li += '                 </button>';
        li += '                 <button type="button" class="btn btn-primary btn-xs" data-time="' + s.end + '" data-mid="' + s.mEndId + '"  data-action="move-to-current-time" title="Move marker to current time">';
        li += '                     <span class="glyphicon glyphicon-screenshot" data-action="move-to-current-time" data-time="' + s.end + '" data-mid="' + s.mEndId + '" ></span>';
        li += '                 </button>';
        li += '                 <button type="button" class="btn btn-danger btn-xs" data-mid="' + s.mEndId + '" data-action="delete-marker" title="Delete marker">';
        li += '                     <span class="glyphicon glyphicon-trash" data-action="delete-marker" data-mId="' + s.mEndId + '"></span>';
        li += '                 </button>';
        li += '                 <span class="time"> ' + appUtils.secondsToHms(s.end) + ' </span>';
        li += '             </div>';
        li += '         </div>';
        li += '     </div>';
        li += ' </div>';
        li += '</li>';

        $('#segments').append(li);
    }
}


/**
 * Draw a marker in every silence found
 * actually for now it's only drawing markers at duration / 4
 * @returns happend markers to waveform
 */
function autoDrawMarkers() {
    // load red marks & draw them to teacher markers zone
    var duration = wavesurfer.backend.getDuration();
    var markerGap = (duration / 4);
    var mTime = markerGap;

    // marker 0 en début de fichier
    var red = Object.create(WaveSurfer.Mark);
    red.id = appUtils.generateUUID();  //wavesurfer.util.getId();
    red.position = 0;
    red.color = '#ff0000';
    red.type = 'teacher';
    wavesurfer.mark(red);

    //mTime += markerGap;

    // marker 1
    red = Object.create(WaveSurfer.Mark);
    red.id = appUtils.generateUUID();
    red.position = mTime;
    red.color = '#ff0000';
    red.type = 'teacher';
    wavesurfer.mark(red);

    mTime += markerGap;

    red = Object.create(WaveSurfer.Mark);
    red.id = appUtils.generateUUID();
    red.position = mTime;
    red.color = '#ff0000';
    red.type = 'teacher';
    wavesurfer.mark(red);

    mTime += markerGap;

    red = Object.create(WaveSurfer.Mark);
    red.id = appUtils.generateUUID();
    red.position = mTime;
    red.color = '#ff0000';
    red.type = 'teacher';
    wavesurfer.mark(red);

    // last marker
    red = Object.create(WaveSurfer.Mark);
    red.id = appUtils.generateUUID();
    red.position = duration;
    red.color = '#ff0000';
    red.type = 'teacher';
    wavesurfer.mark(red);
}

function initSegmentsAndMarkers() {
    segments = [];
    if (wavesurfer.markers)
        wavesurfer.clearMarks();
    $('#segments li').remove();
    toggleSegmentButtons();
}

function initUI() {
    // if a wave has already be drawned    
    $('#waveform wave').remove();

    // hide student / teacher part depending on who i am
    if (isStudent) {
        $("#teacher-markers").css('display', 'none');
        $("#teacher-tools").css('display', 'none');
        $("#student-markers").css('visibility', 'visible');
        $("#student-tools").css('visibility', 'visible');
    }
    else {
        $("#teacher-markers").css('visibility', 'visible');
        $("#teacher-tools").css('visibility', 'visible');
        $("#student-markers").css('display', 'none');
        $("#student-tools").css('display', 'none');
    }

    // hide segments area
    $('#teacher-segments').css('display', 'none');
    // display no-file screen
    $('#no-file').css('display', '');
    toggleSegmentButtons();
}

function toggleSegmentButtons() {
    $('#create-segments').prop('disabled', true);
    $('#auto-draw').prop('disabled', false);
    $('#split-files').prop('disabled', true);
    $('#save-segments').prop('disabled', true);
    $('#del-segments').prop('disabled', true);
    //$("#create-segments").prop('disabled', true);
    if (appUtils.countMarkers(wavesurfer.markers) > 1) {
        $("#create-segments").prop('disabled', false);
        $("#auto-draw").prop('disabled', true);
    }
    if (segments.length > 0) {
        $("#create-segments").prop('disabled', true);
        $('#del-segments').prop('disabled', false);
        $('#save-segments').prop('disabled', false);
        if (segments.length > 1)
            $('#split-files').prop('disabled', false);
    }
}

function splitAudio(fUrl, mSeg) {
    var formData = new FormData();
    formData.append('fUrl', fUrl);
    var temp = [];
    for (var i = 0; i < mSeg.length; i++) {

        var s = new Object();//.create();//mSeg[i];
        s.start = appUtils.secondsToHms(mSeg[i].start);
        s.end = appUtils.secondsToHms(mSeg[i].end);

        temp.push(s);
    }
    formData.append('segments', JSON.stringify(temp));
    // POST
    var result = appUtils.xhr('split.php', formData, function(response) {
        // return an array of processed url files
        console.log(response);

    });
}

function uploadFile(filename, file, directory) {
    var formData = new FormData();
    formData.append('filename', filename);
    formData.append('file', file);
    formData.append('directory', directory);

    // POST
    appUtils.xhr('save.php', formData, function(response) {
        currentAudioUrl = response.dirname + '/' + response.basename;
        currentAudioId = appUtils.generateUUID();
        isEditing = false;
        initWavesurfer(currentAudioUrl);
        initSegmentsAndMarkers();
        hideNoFileArea();
        displaySegmentsArea();
    });
}

function initWavesurfer(file) {
    wavesurfer.init(options);
    if (file)
        wavesurfer.load(file);
    else {
        wavesurfer.load('media/demo_jpp.mp3');
    }
    // Start listening to drag'n'drop on document
    // wavesurfer.bindDragNDrop('#drop');
}

function displaySegmentsArea() {
    $('#teacher-segments').css('display', '');
}

function hideNoFileArea() {
    $('#no-file').css('display', 'none');
}

function saveSegmentCollection(scName) {
    var sArray = [];
    // read all segments info in html
    $('#segments li').each(function(index) {
        var id = this.id;
        var name = $('#' + id + '-name').val() === '' ? index + '_' + currentAudioUrl.split('/')[1].split('.')[0] : $('#' + id + '-name').val();
        var comment = '';//$('#' + id + '-comment').val();
        var start = $(this).attr('data-start');
        var mStartId = $(this).attr('data-mstartid');
        var end = $(this).attr('data-end');
        var mEndId = $(this).attr('data-mendid');
        if (name !== '' && start !== '' && mStartId !== '' && end !== '' && mEndId !== '') {
            var s = new Segment();
            s.init(
                    id,
                    currentAudioUrl,
                    currentAudioId,
                    name,
                    comment,
                    start,
                    mStartId,
                    end,
                    mEndId
                    );
            sArray.push(s);
        }

        else {
            var alertMsg = '';
            alertMsg += '<p class="alert">';
            alertMsg += '   Missing datas!';
            alertMsg += '</p>';
            bootbox.alert(alertMsg);
        }
    });
    var collId;
    if (isEditing) {
        collId = curCollection.id;
        curCollection.segments = sArray;
        curCollection.name = scName;
        var index = appUtils.getSegmentCollectionIndexById(sCList, collId);
        sCList.splice(index, 1, JSON.stringify(curCollection));
    }
    else {
        collId = appUtils.generateUUID();
        curCollection = null;
        curCollection = new SegmentCollection(collId, scName, currentAudioId, currentAudioUrl, sArray);
        sCList.push(JSON.stringify(curCollection));
    }    
    isEditing = true;
}

function drawSegmentCollection(collection) {
    initSegmentsAndMarkers();
    initUI();
    hideNoFileArea();
    initWavesurfer(collection.fUrl);
    displaySegmentsArea();
    segments = collection.segments;    
    showSegments(segments);
}

function drawMarkerCollection(_segments){
    for (var i = 0; i < _segments.length; i++) {
        var s = _segments[i];
        // dans tous les cas dessiner marker début uniquement
        var m1 = Object.create(WaveSurfer.Mark);
        m1.id = s.mStartId;
        m1.position = parseFloat(s.start);
        m1.color = '#ff0000';
        m1.type = 'teacher';
        wavesurfer.mark(m1);

        // si dernier segment dessiner le marker début plus fin
        if (i === (_segments.length - 1)) {
            var m2 = Object.create(WaveSurfer.Mark);
            m2.id = s.mEndId;
            m2.position = parseFloat(s.end);
            m2.color = '#ff0000';
            m2.type = 'teacher';
            wavesurfer.mark(m2);
        }
    }
    toggleSegmentButtons();
}
