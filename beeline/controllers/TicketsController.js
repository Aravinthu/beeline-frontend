export default [
  '$scope',
  'TicketService',
  'UserService',
  'LiteRouteSubscriptionService',
  'LiteRoutesService',
  'loadingSpinner',
  function(
    $scope,
    TicketService,
    UserService,
    LiteRouteSubscriptionService,
    LiteRoutesService,
    loadingSpinner
  ) {
    var normalRoutesPromise = Promise.resolve(null);;
    var liteRoutesPromise = Promise.resolve(null);

    // Track the login state of the user service
    $scope.logIn = function() {
      UserService.promptLogIn()
    };

    $scope.$watch(() => UserService.getUser() && UserService.getUser().id, () => {
      refreshTickets(true);
      $scope.user = UserService.getUser();
    });

    // Grab the tickets
    $scope.tickets = {};

    $scope.$on('$ionicView.afterEnter', () => {
      loadingSpinner(Promise.all([normalRoutesPromise, liteRoutesPromise]));
    });

    $scope.$watch(() => TicketService.getShouldRefreshTickets(), (value) => {
      if (!value) return;
      normalRoutesPromise = refreshNormalTickets(true);
    })
    $scope.$watch(() => LiteRoutesService.getShouldRefreshLiteTickets(), (value) => {
      if (!value) return;
      liteRoutesPromise = refreshLiteTickets(true);
    })

    function refreshTickets(ignoreCache) {
      normalRoutesPromise = refreshNormalTickets(ignoreCache)
      liteRoutesPromise = refreshLiteTickets(ignoreCache)
    }

    function refreshNormalTickets(ignoreCache) {
      return TicketService.getCategorizedTickets(ignoreCache).then((categorizedTickets) => {
        $scope.tickets.today = categorizedTickets.today;
        $scope.tickets.soon = categorizedTickets.afterToday;
        $scope.error = false;
      })
      .catch((error) => {
        $scope.error = true;
      })
      .finally(() => {
        $scope.$broadcast('scroll.refreshComplete');
      });
    }

    function refreshLiteTickets(ignoreCache) {
      LiteRoutesService.clearShouldRefreshLiteTickets();
      return LiteRouteSubscriptionService.getSubscriptions(ignoreCache).then(async(liteRouteSubscriptions)=>{

          var liteLabelAndRoutes = []
          for (let subscribedLiteLabel of liteRouteSubscriptions) {
            var subscribedLiteRoute = await LiteRoutesService.getLiteRoute(subscribedLiteLabel)
            liteLabelAndRoutes.push({"label": subscribedLiteLabel,"liteRoute": subscribedLiteRoute})
          }
          $scope.liteRouteSubscriptions = liteLabelAndRoutes;
          $scope.error = false;
        })
        .catch((error) => {
          $scope.error = true;
        })
        .finally(() => {
          $scope.$broadcast('scroll.refreshComplete');
        });
    }

    $scope.refreshTickets = refreshTickets;
  }
];
