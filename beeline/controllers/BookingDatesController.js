var moment = require('moment');
import _ from 'lodash'

export default [
  '$scope',
  '$state',
  '$http',
  'BookingService',
  'UserService',
  'RoutesService',
  '$stateParams',
  'TicketService',
  'loadingSpinner', '$q', '$ionicScrollDelegate',
  function($scope, $state, $http, BookingService, UserService,
    RoutesService, $stateParams, TicketService, loadingSpinner, $q,
  $ionicScrollDelegate) {
    var now = new Date();

    // Booking session logic.
    // Defines the set of variables that, when changed, all user inputs
    // on this page should be cleared.
    $scope.session = {
      sessionId: null,
      userId: null,
    }
    // Data logic;
    $scope.book = {
      routeId: '',
      route: null,
      boardStopId: undefined,
      alightStopId: undefined,
      priceInfo: {},
      selectedDates: [],
      invalidStopDates: [],
      useRouteCredits: true,
      showRouteCredits: true,
    };
    // Display Logic;
    $scope.disp = {
      month: moment(),
      validDates: [],
      soldOutDates: [],
      bookedDates: [],
      today: moment(),
      availabilityDays: undefined,
      previouslyBookedDays: undefined,
      highlightDays: [],
      daysAllowed: [],
      selectedDatesMoments: [],
    };
    $scope.book.routeId = +$stateParams.routeId;
    $scope.session.sessionId = $stateParams.sessionId;
    $scope.book.boardStopId = parseInt($stateParams.boardStop);
    $scope.book.alightStopId = parseInt($stateParams.alightStop);

    loadTickets();

    var routePromise = loadRoutes();
    $scope.book.creditTag = $stateParams.creditTag
    var routeCreditsPromise = UserService.fetchRouteCredits($scope.book.creditTag)
    $q.all([routePromise, routeCreditsPromise]).then(function(values){
      let creditsAvailable = values[1]
      let ticketPrice = $scope.book.route.trips[0].priceF
      $scope.book.route.ridesRemaining = Math.floor(parseFloat(creditsAvailable)/ticketPrice)
    })

    $scope.$watch(()=>UserService.getUser(), loadTickets);

    $scope.$watch(
       /* Don't watch the entire moment objects, just their value */
       () => $scope.disp.selectedDatesMoments.map(m => m.valueOf()),
       () => {
       // multiple-date-picker gives us the
       // date in midnight local time
       // Need to convert to UTC
       $scope.book.selectedDates = $scope.disp.selectedDatesMoments.map(
         m => m.valueOf()
       )
     }, true)

    $scope.$watchGroup(['disp.availabilityDays', 'disp.previouslyBookedDays'],
      ([availabilityDays, previouslyBookedDays]) => {
        $scope.disp.highlightDays = [];
        $scope.disp.daysAllowed = [];

        if (!availabilityDays || !previouslyBookedDays) {
          return;
        }

        for (let time of Object.keys($scope.disp.availabilityDays)) {
          time = parseInt(time)
          let timeMoment = moment(time).utcOffset(0);
          if (time in $scope.disp.previouslyBookedDays) {
            $scope.disp.highlightDays.push({
              date: timeMoment,
              css: 'previously-booked',
              selectable: false,
              annotation: $scope.book.route.tripsByDate[time].bookingInfo &&
                          $scope.book.route.tripsByDate[time].bookingInfo.notes && ' ',
            })
          }
          else if ($scope.disp.availabilityDays[time] <= 0) {
            $scope.disp.highlightDays.push({
              date: timeMoment,
              css: 'sold-out',
              selectable: false,
              annotation: $scope.book.route.tripsByDate[time].bookingInfo &&
                          $scope.book.route.tripsByDate[time].bookingInfo.notes && ' ',
            })
          }
          else {
            $scope.disp.highlightDays.push({
              date: timeMoment,
              css: '',
              selectable: true,
              annotation: $scope.book.route.tripsByDate[time].bookingInfo &&
                          $scope.book.route.tripsByDate[time].bookingInfo.notes && ' ',
            })
            $scope.disp.daysAllowed.push(timeMoment)
          }
        }

        $scope.disp.selectedDatesMoments = _.intersectionBy(
          $scope.disp.selectedDatesMoments,
          $scope.disp.daysAllowed,
          m => m.valueOf()
        )
      })

    $scope.$on('priceCalculator.done', () => {
      $ionicScrollDelegate.resize();
    })

    function loadTickets() {
      var ticketsPromise = TicketService.getPreviouslyBookedDaysByRouteId($scope.book.routeId, true)
        .catch((err) => null)

      loadingSpinner($q.all([ticketsPromise]).then(([tickets]) => {
        $scope.disp.previouslyBookedDays = tickets || {};
      }));
    }
    function loadRoutes() {
      var routePromise = RoutesService.getRoute($scope.book.routeId, true)
      return loadingSpinner(routePromise.then((route) => {
        // Route
        $scope.book.route = route;
        updateCalendar(); // updates availabilityDays
      }));


    }
    function updateCalendar() {
      // ensure cancelled trips are not shown
      // var runningTrips = $scope.book.route.trips.filter(tr => tr.status !== 'cancelled');
      var runningTrips = $scope.book.route.trips.filter(tr => tr.isRunning);

      // discover which month to show. Use UTC timezone
      $scope.disp.month = moment(_.min(runningTrips.map(t => t.date))).utcOffset(0);

      // reset
      $scope.disp.availabilityDays = {}

      // booking window restriction
      var now = Date.now();

      for (let trip of runningTrips) {
        // FIXME: disable today if past the booking window

        // Make it available, only if the stop is valid for this trip
        var stopIds = trip.tripStops
          .filter(t => t.time.getTime() > now)
          .map(ts => ts.stop.id);
        if (stopIds.indexOf($scope.book.boardStopId) === -1 ||
            stopIds.indexOf($scope.book.alightStopId) === -1) {
          continue;
        }

        $scope.disp.availabilityDays[trip.date.getTime()] = trip.availability.seatsAvailable;
      }
    }
  },
];
