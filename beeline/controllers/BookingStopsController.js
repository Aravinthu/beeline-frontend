import {NetworkError} from '../shared/errors';
import {formatDate, formatTime, formatUTCDate, formatHHMM_ampm} from '../shared/format';

export default [
  '$rootScope',
  '$scope',
  '$interpolate',
  '$state',
  '$stateParams',
  '$ionicModal',
  '$http',
  '$cordovaGeolocation',
  'BookingService',
  'RoutesService',
  'CompanyService',
  'uiGmapGoogleMapApi',
  'MapOptions',
  '$timeout',
  'loadingSpinner',
  function(
    $rootScope,
    $scope,
    $interpolate,
    $state,
    $stateParams,
    $ionicModal,
    $http,
    $cordovaGeolocation,
    BookingService,
    RoutesService,
    CompanyService,
    uiGmapGoogleMapApi,
    MapOptions,
    $timeout,
    loadingSpinner
  ) {
    // Gmap default settings
    $scope.map = MapOptions.defaultMapOptions();

    // Default settings for various info used in the page
    $scope.book = {
      routeId: '',
      route: null,
      boardStops: [], // all board stops for this route
      alightStops: [], // all alight stops for this route
      boardStop: null,
      alightStop: null,
      changes: {},
      company: {},
    };

    // @hongyi
    // if $ionicView.afterEnter is set from
    // within uiGmapGoogleMapApi.then(() => {}) and the map api
    // resolves AFTER the page enters, the afterEnter event will
    // never be fired.
    //
    // So afterEnter is set from within the main scope function
    // However, it must then wait for the map to be ready.'
    // Hence this promise.
    var gmapIsReady = new Promise((resolve, reject) => {
      var resolved = false;
      $scope.$watch('map.control.getGMap', function() {
        if ($scope.map.control.getGMap) {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }
      });
    });

    $scope.$on('$ionicView.afterEnter', () => {
      $scope.book.routeId = $stateParams.routeId;
      $scope.book.boardStopId = parseInt($stateParams.boardStop);
      $scope.book.alightStopId = parseInt($stateParams.alightStop);
      window.setStop = $scope.setStop;

      loadingSpinner(gmapIsReady.then(() => {
        var gmap = $scope.map.control.getGMap();
        google.maps.event.trigger(gmap, 'resize');
        $scope.displayRouteInfo();
      }));
    });

    gmapIsReady.then(function() {
      var gmap = $scope.map.control.getGMap();
      $scope.alightMarkerOptions = {
        icon: {
          url: 'img/alight.png',
          scaledSize: new google.maps.Size(20, 20),
          anchor: new google.maps.Point(5, 5),
        },
      };

      $scope.boardMarkerOptions = {
        icon: {
          url: 'img/board.png',
          scaledSize: new google.maps.Size(20, 20),
          anchor: new google.maps.Point(5, 5),
        },
      };
      var timer;
      timer = $timeout(function() {
        // Disable the Google link at the bottom left of the map
        var glink = angular.element(document.getElementsByClassName("gm-style-cc"));
        glink.next().find('a').on('click', function(e) {
          e.preventDefault();
        });
      }, 300);

      $scope.routePath = [];

      $scope.$on('$destroy', () => {
        if ($scope.changesModal) {
          $scope.changesModal.remove();
        }
        if (timer) {
          $timeout.cancel(timer);
        }
      });

      $scope.setStop = function() {
        var stop = $scope.infoStop;
        var type = $scope.infoType;

        $scope.$apply(() => {
        if (type == 'board') {
          $scope.book.boardStopId = stop.id;
        }
        else {
          $scope.book.alightStopId = stop.id;
        }
        /* Hide the infowindow */
        $scope.infoStop = null;
        $scope.infoType = null;
      });
      };

      /* These functions teach the <bus-stop-selector> how
       to display the stop id and description */
      $scope.getStopId = (stop) => stop.id;
      $scope.getStopDescription = (stop) =>
      formatTime(stop.time) + ' \u00a0\u00a0' + stop.description;
      $scope.getStopDescription2 = (stop) =>
      stop.road;

      // FIXME: start/end marker on selected stops

      // Load the data for the selected route
      // Which data?
      // 1. Route info
      // 2. Company info
      // 3. Changes to route
      $scope.lastDisplayedRouteId = null; // works if caching
      $scope.displayRouteInfo = function() {
        var routesPromise = RoutesService.getRoute(parseInt($scope.book.routeId))
        .then((route) => {
          // 1. Route info
          $scope.routePath = route.path.map(latlng => ({
            latitude: latlng.lat,
            longitude: latlng.lng,
          }));
          $scope.book.route = route;
          console.log($scope.book.route);
          computeStops();
          panToStops();

          // 3. Check if we should display changes
          if ($scope.lastDisplayedRouteId != $scope.book.routeId) {
            var changes = BookingService.computeChanges(route);
            $scope.book.changes = changes;
            console.log(changes);

            if (changes.priceChanges.length == 0 &&
                changes.stopChanges.length == 0 &&
                changes.timeChanges.length == 0) {
                return;
              }

            // FIXME: We are hiding this for now, until
            // we get the UI right. We should be pulling
            // the announcements from RouteAnnouncements instead

            // if ($scope.changesModal) {
            //     $scope.changesModal.show();
            //   }
            // else {
            //   $ionicModal.fromTemplateUrl('changes-message.html', {
            //     scope: $scope,
            //     animation: 'slide-in-up',
            //   })
            //   .then(modal => {
            //     $scope.changesModal = modal;
            //     $scope.changesModal.show();
            //   });
            // }
          }
          $scope.lastDisplayedRouteId = $scope.book.routeId;

          // 2. Fill in the transport company info
          return CompanyService.getCompany(+route.trips[0].transportCompanyId)
          .then(function(result) {
            $scope.book.company = result;
          });
        })
        .then(null, err => console.log(err.stack));

        loadingSpinner(routesPromise);
      };

      $scope.closeChangesModal = function() {
        $scope.changesModal.hide();
      };

      /* ----- Methods ----- */
      // Click function for User Position Icon
      $scope.getUserLocation = MapOptions.locateMe($scope.map.control);

      function computeStops() {
        var trips = $scope.book.route.trips;
        var [boardStops, alightStops] = BookingService.computeStops(trips);
        $scope.book.boardStops = boardStops;
        $scope.book.alightStops = alightStops;

        if (boardStops.length == 1) {
          $scope.book.boardStopId = boardStops[0].id;
        }
        if (alightStops.length == 1) {
          $scope.book.alightStopId = alightStops[0].id;
        }
      }

      function panToStops() {
        var stops = [];
        stops = $scope.book.boardStops.concat($scope.book.alightStops);

        if (stops.length == 0) {
        return;
      }
        var bounds = new google.maps.LatLngBounds();
        for (let s of stops) {
          bounds.extend(new google.maps.LatLng(
            s.coordinates.coordinates[1],
            s.coordinates.coordinates[0]
          ));
        }
        $scope.map.control.getGMap().fitBounds(bounds);
      }

      $scope.tapBoard = function(board) {
      // nconsole.log($state);
        window.setStop = $scope.setStop;
        $scope.infoStop = board;
        $scope.infoType = 'board';
      };
      $scope.tapAlight = function(alight) {
        window.setStop = $scope.setStop;
        $scope.infoStop = alight;
        $scope.infoType = 'alight';
      };
      $scope.applyTapAlight = (marker, event, model) => {
        $scope.$apply(() => $scope.tapAlight(model))
      };
      $scope.applyTapBoard = (marker, event, model) => {
        $scope.$apply(() => $scope.tapBoard(model))
      };
    });

    // Extract the coordinates of the selected stops
    $scope.$watch('book.boardStopId', (stopId) => {
      if (!stopId || !$scope.book.boardStops) return;

      $scope.book.boardStop = stopId ?
        $scope.book.boardStops.find(x => x.id == stopId)
        : null;
    })
    $scope.$watch('book.alightStopId', (stopId) => {
      if (!stopId || !$scope.book.alightStops) return;

      $scope.book.alightStop = stopId ?
        $scope.book.alightStops.find(x => x.id == stopId)
        : null;
    })
  }
];
