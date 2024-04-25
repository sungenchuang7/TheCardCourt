const mysql = require('mysql')
const config = require('./config.json')

// Creates MySQL connection using database credential provided in config.json
// Do not edit. If the connection fails, make sure to check that config.json is filled out correctly
const connection = mysql.createConnection({
  host: config.rds_host,
  user: config.rds_user,
  password: config.rds_password,
  port: config.rds_port,
  database: config.rds_db
});
connection.connect((err) => err && console.log(err));

// Route 1: GET /players/card
const playerCard = async (req, res) => {
  const { playerName, stats } = req.body;

  if (!playerName || !stats || !stats.points) {
    res.status(400).json({ error: 'Invalid player data' });
    return;
  }

  const playerCard = {
    playerName,
    stats,
  };

  res.status(200).json(playerCard);
};

// Route 2: GET /teams/random
const randomTeam = async function (req, res) {
  connection.query(`
    SELECT *
    FROM Teams
    ORDER BY RAND()
    LIMIT 1
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 3: GET /players/efficiency
const playerEfficiency = async function (req, res) {
  connection.query(`
  WITH games_efficiency AS (
    SELECT PLAYER_ID, PLAYER_NAME,
           (Points + REB + AST + STL + BLK - ((FGA - FGM) + (FTA - FTM) + TurnOver)) AS EFF
    FROM Games_details
  )
  SELECT PLAYER_ID, PLAYER_NAME, AVG(EFF) AS AVG_EFF
  FROM games_efficiency
  GROUP BY PLAYER_ID
  ORDER BY average_efficiency DESC
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
}

// Route 4: GET /players/rarities
const playerRarity = async function (req, res) {
  connection.query(`
    WITH games_performance_index AS (
      SELECT PLAYER_ID, PLAYER_NAME, TEAM_ID,
             (Points + REB + AST + STL + BLK - 
              ((FGA - FGM) + (FTA - FTM) + 
               TurnOver + PersonalFouls)) AS P_INDEX
      FROM Games_details
    ),
    player_ranks AS (
      SELECT PLAYER_NAME, PLAYER_ID, TEAM_ID, P_INDEX,
             PERCENT_RANK() OVER (ORDER BY P_INDEX DESC) AS percentile_rank
      FROM games_performance_index
    )
    SELECT PLAYER_ID, PLAYER_NAME, TEAM_ID,
           CASE
               WHEN percentile_rank <= 0.1 THEN 'gold'
               WHEN percentile_rank <= 0.3 THEN 'silver'
               ELSE 'bronze'
           END AS rarity
    FROM player_ranks
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
}

// Route 5: GET /teams/highest_scorers
const highestScorers = async function (req, res) {
  connection.query(`
    WITH lifetime_pts AS (
        SELECT TEAM_ID, PLAYER_ID, PLAYER_NAME, SUM(Points) AS TOTAL_PTS
        FROM Games_details
        GROUP BY PLAYER_ID, TEAM_ID
    )
    SELECT t.TEAM_ID, t.ABBREVIATION AS team_abbreviation, i.PLAYER_NAME, MAX(i.TOTAL_PTS) AS LIFETIME_PTS
    FROM lifetime_pts i
    JOIN Teams t ON i.TEAM_ID = t.TEAM_ID
    GROUP BY t.TEAM_ID, t.ABBREVIATION
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 6: GET /teams/ratings
const teamRatings = async function (req, res) {
  connection.query(`
    WITH home_team AS (
        SELECT HOME_TEAM_ID, SEASON, SUM(PTS_home) AS HOME_PTS, SUM(PTS_away) AS PTS_allowed
        FROM Games_summary
        GROUP BY HOME_TEAM_ID, SEASON
    ),
    away_team AS (
        SELECT VISITOR_TEAM_ID, SEASON, SUM(PTS_away) AS AWAY_PTS, SUM(PTS_home) AS PTS_allowed
        FROM Games_summary
        GROUP BY VISITOR_TEAM_ID, SEASON
    ),
    offense_table AS (
        SELECT ht.HOME_TEAM_ID AS TEAM_ID, ht.SEASON AS SEASON, (ht.HOME_PTS + at.AWAY_PTS) AS TOTAL_PTS
        FROM home_team ht
        INNER JOIN away_team at ON ht.HOME_TEAM_ID = at.VISITOR_TEAM_ID AND ht.SEASON = at.SEASON
    ),
    offensive_percentiles AS (
        SELECT TEAM_ID, TOTAL_PTS, SEASON,
               NTILE(10) OVER (PARTITION BY SEASON ORDER BY TOTAL_PTS DESC) AS percentile_rank
        FROM offense_table
    ),
    defense_table AS (
        SELECT ht.HOME_TEAM_ID AS TEAM_ID, ht.SEASON AS SEASON,
               (at.PTS_allowed + ht.PTS_allowed) AS TOTAL_PTS_ALLOWED
        FROM home_team ht
        INNER JOIN away_team at ON ht.HOME_TEAM_ID = at.VISITOR_TEAM_ID AND ht.SEASON = at.SEASON
    ),
    defensive_percentiles AS (
        SELECT TEAM_ID, TOTAL_PTS_ALLOWED, SEASON,
               NTILE(10) OVER (PARTITION BY SEASON ORDER BY TOTAL_PTS_ALLOWED) AS percentile_rank
        FROM defense_table
    )
    SELECT op.TEAM_ID AS TEAM_ID, op.SEASON AS SEASON,
           CASE
               WHEN op.percentile_rank = 1 THEN '10/10'
               WHEN op.percentile_rank = 2 THEN '9/10'
               WHEN op.percentile_rank = 3 THEN '8/10'
               WHEN op.percentile_rank = 4 THEN '7/10'
               WHEN op.percentile_rank = 5 THEN '6/10'
               WHEN op.percentile_rank = 6 THEN '5/10'
               WHEN op.percentile_rank = 7 THEN '4/10'
               WHEN op.percentile_rank = 8 THEN '3/10'
               WHEN op.percentile_rank = 9 THEN '2/10'
               ELSE '1/10'
           END AS offensive_rank,
           CASE
               WHEN dp.percentile_rank = 1 THEN '10/10'
               WHEN dp.percentile_rank = 2 THEN '9/10'
               WHEN dp.percentile_rank = 3 THEN '8/10'
               WHEN dp.percentile_rank = 4 THEN '7/10'
               WHEN dp.percentile_rank = 5 THEN '6/10'
               WHEN dp.percentile_rank = 6 THEN '5/10'
               WHEN dp.percentile_rank = 7 THEN '4/10'
               WHEN dp.percentile_rank = 8 THEN '3/10'
               WHEN dp.percentile_rank = 9 THEN '2/10'
               ELSE '1/10'
           END AS defensive_rank
    FROM offensive_percentiles op
    JOIN defensive_percentiles dp ON dp.TEAM_ID = op.TEAM_ID AND dp.SEASON = op.SEASON
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 7: GET /players/stats_rankings
const playerStatsRankings = async function (req, res) {
  connection.query(`
    WITH total_pts_table AS (
      SELECT PLAYER_ID, SUM(Points) AS TOTAL_PTS
      FROM Games_details
      GROUP BY PLAYER_ID
    ),
    scoring_percentiles AS (
      SELECT PLAYER_ID, TOTAL_PTS,
             NTILE(10) OVER (ORDER BY TOTAL_PTS DESC) AS percentile_rank
      FROM total_pts_table
    ),
    defense_table AS (
      SELECT PLAYER_ID, SUM(DREB) + SUM(BLK) + SUM(STL) AS DEFENSIVE_PLAYS
      FROM Games_details
      GROUP BY PLAYER_ID
    ),
    defensive_percentiles AS (
      SELECT PLAYER_ID, DEFENSIVE_PLAYS,
             NTILE(10) OVER (ORDER BY DEFENSIVE_PLAYS DESC) AS percentile_rank
      FROM defense_table
    )
    SELECT dp.PLAYER_ID,
           CASE
               WHEN dp.percentile_rank = 1 THEN '10/10'
               WHEN dp.percentile_rank = 2 THEN '9/10'
               WHEN dp.percentile_rank = 3 THEN '8/10'
               WHEN dp.percentile_rank = 4 THEN '7/10'
               WHEN dp.percentile_rank = 5 THEN '6/10'
               WHEN dp.percentile_rank = 6 THEN '5/10'
               WHEN dp.percentile_rank = 7 THEN '4/10'
               WHEN dp.percentile_rank = 8 THEN '3/10'
               WHEN dp.percentile_rank = 9 THEN '2/10'
               ELSE '1/10'
           END AS defensive_rank,
           CASE
               WHEN sp.percentile_rank = 1 THEN '10/10'
               WHEN sp.percentile_rank = 2 THEN '9/10'
               WHEN sp.percentile_rank = 3 THEN '8/10'
               WHEN sp.percentile_rank = 4 THEN '7/10'
               WHEN sp.percentile_rank = 5 THEN '6/10'
               WHEN sp.percentile_rank = 6 THEN '5/10'
               WHEN sp.percentile_rank = 7 THEN '4/10'
               WHEN sp.percentile_rank = 8 THEN '3/10'
               WHEN sp.percentile_rank = 9 THEN '2/10'
               ELSE '1/10'
           END AS offensive_rank
    FROM defensive_percentiles dp
    JOIN scoring_percentiles sp ON dp.PLAYER_ID = sp.PLAYER_ID
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 8: GET /players/scores
const playerScores = async function (req, res) {
  connection.query(`
    SELECT P.PLAYER_NAME, P.TEAM_ID, T.ABBREVIATION AS TEAM_ABBREVIATION, GS.SEASON, 
           ROUND(AVG(GD.Points) * 0.4 + AVG(GD.REB) * 0.2 + AVG(GD.AST) * 0.2 + (AVG(GD.STL) + AVG(GD.BLK)) * 0.2, 2) AS Player_Score
    FROM Games_details GD
    JOIN Players P ON GD.PLAYER_ID = P.PLAYER_ID
    JOIN Teams T ON P.TEAM_ID = T.TEAM_ID
    JOIN Games_summary GS ON GS.GAME_ID = GD.GAME_ID AND GS.SEASON = '2022'
    WHERE GS.SEASON = '2022'
    GROUP BY P.PLAYER_NAME, P.TEAM_ID, GS.SEASON
    HAVING COUNT(DISTINCT GD.GAME_ID) >= 15
    ORDER BY Player_Score DESC
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 9: GET /managers/scores
const managerScores = async function (req, res) {
  connection.query(`
    WITH SeasonStats AS (
        SELECT T.TEAM_ID, T.HEADCOACH, GS.SEASON,
            SUM(CASE 
                    WHEN GS.HOME_TEAM_WINS = 1 AND GS.HOME_TEAM_ID = T.TEAM_ID THEN 1
                    WHEN GS.HOME_TEAM_WINS = 0 AND GS.VISITOR_TEAM_ID = T.TEAM_ID THEN 1
                    ELSE 0 
                END) AS Wins,
            COUNT(DISTINCT GS.GAME_ID) AS Games
        FROM Teams T
        JOIN Games_summary GS ON T.TEAM_ID = GS.HOME_TEAM_ID OR T.TEAM_ID = GS.VISITOR_TEAM_ID
        WHERE GS.SEASON = 2022 OR GS.SEASON = 2021
        GROUP BY T.TEAM_ID, GS.SEASON
    ),
    WinPercentage AS (
        SELECT TEAM_ID, SEASON, ROUND(Wins / CAST(Games AS FLOAT), 3) AS WinPct
        FROM SeasonStats
    )
    SELECT SS.HEADCOACH AS Manager_Name, 
           SS.TEAM_ID, 
           SS.SEASON,
           WP.WinPct AS Current_Season_WinPct, 
           WP.WinPct - LAG(WP.WinPct) OVER (PARTITION BY SS.TEAM_ID ORDER BY SS.SEASON) AS Improvement
    FROM SeasonStats SS
    JOIN WinPercentage WP ON SS.TEAM_ID = WP.TEAM_ID AND SS.SEASON = WP.SEASON
    WHERE SS.SEASON = 2022
    ORDER BY Improvement DESC, Current_Season_WinPct DESC
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 10: GET /teams/homecourt_advantage
const homecourtAdvantage = async function (req, res) {
  connection.query(`
    WITH total_home_wins AS (
        SELECT HOME_TEAM_ID, SUM(HOME_TEAM_WINS) AS HOME_WINS
        FROM Games_summary
        GROUP BY HOME_TEAM_ID
    ),
    homecourt_adv_percentiles AS (
        SELECT HOME_TEAM_ID, HOME_WINS,
               NTILE(10) OVER (ORDER BY HOME_WINS DESC) AS percentile_rank
        FROM total_home_wins
    )
    SELECT t.TEAM_ID, t.NICKNAME, t.CITY, t.ARENA, 
           CASE
               WHEN hca.percentile_rank = 1 THEN '10/10'
               WHEN hca.percentile_rank = 2 THEN '9/10'
               WHEN hca.percentile_rank = 3 THEN '8/10'
               WHEN hca.percentile_rank = 4 THEN '7/10'
               WHEN hca.percentile_rank = 5 THEN '6/10'
               WHEN hca.percentile_rank = 6 THEN '5/10'
               WHEN hca.percentile_rank = 7 THEN '4/10'
               WHEN hca.percentile_rank = 8 THEN '3/10'
               WHEN hca.percentile_rank = 9 THEN '2/10'
               ELSE '1/10'
           END AS homecourt_adv
    FROM homecourt_adv_percentiles hca
    JOIN Teams t ON t.TEAM_ID = hca.HOME_TEAM_ID
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 11: GET /players/transfers
const playerTransfers = async function (req, res) {
  connection.query(`
    SELECT
      PlayerTransfers.PLAYER_NAME,
      COUNT(PlayerTransfers.season_from) AS transfer_count
    FROM (
      SELECT
        p1.PLAYER_NAME,
        p1.SEASON AS season_from,
        p2.SEASON AS season_to
      FROM
        Players p1
      JOIN
        Players p2 ON p1.PLAYER_ID = p2.PLAYER_ID AND p1.SEASON = p2.SEASON - 1
      WHERE
        p1.TEAM_ID <> p2.TEAM_ID
    ) AS PlayerTransfers
    GROUP BY
      PlayerTransfers.PLAYER_NAME
    ORDER BY
      transfer_count DESC, PlayerTransfers.PLAYER_NAME
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 12: GET /teams/transfers
const teamTransfers = async function (req, res) {
  connection.query(`
    SELECT
      COALESCE(i.season, o.season) AS season,
      COALESCE(i.team_id, o.team_id) AS team_id,
      COALESCE(team_abbreviation_in, team_abbreviation_out) AS team_abbreviation,
      COALESCE(i.incoming_transfers, 0) AS incoming_transfers,
      COALESCE(o.outgoing_transfers, 0) AS outgoing_transfers,
      (COALESCE(i.incoming_transfers, 0) - COALESCE(o.outgoing_transfers, 0)) AS net_transfers
    FROM (
      SELECT
        p2.SEASON AS season,
        p2.TEAM_ID AS team_id,
        t.ABBREVIATION AS team_abbreviation_in,
        COUNT(*) AS incoming_transfers
      FROM
        Players p1
      JOIN
        Players p2 ON p1.PLAYER_ID = p2.PLAYER_ID AND p1.SEASON = p2.SEASON - 1
      JOIN
        Teams t ON p2.TEAM_ID = t.TEAM_ID
      WHERE
        p1.TEAM_ID <> p2.TEAM_ID
      GROUP BY
        p2.SEASON, p2.TEAM_ID
    ) i
    LEFT JOIN (
      SELECT
        p1.SEASON AS season,
        p1.TEAM_ID AS team_id,
        t.ABBREVIATION AS team_abbreviation_out,
        COUNT(*) AS outgoing_transfers
      FROM
        Players p1
      JOIN
        Players p2 ON p1.PLAYER_ID = p2.PLAYER_ID AND p1.SEASON = p2.SEASON - 1
      JOIN
        Teams t ON p1.TEAM_ID = t.TEAM_ID
      WHERE
        p1.TEAM_ID <> p2.TEAM_ID
      GROUP BY
        p1.SEASON, p1.TEAM_ID
    ) o ON i.season = o.season AND i.team_id = o.team_id
    UNION
    SELECT
      COALESCE(i.season, o.season) AS season,
      COALESCE(i.team_id, o.team_id) AS team_id,
      COALESCE(team_abbreviation_in, team_abbreviation_out) AS team_abbreviation,
      COALESCE(i.incoming_transfers, 0) AS incoming_transfers,
      COALESCE(o.outgoing_transfers, 0) AS outgoing_transfers,
      (COALESCE(i.incoming_transfers, 0) - COALESCE(o.outgoing_transfers, 0)) AS net_transfers
    FROM (
      SELECT
        p2.SEASON AS season,
        p2.TEAM_ID AS team_id,
        t.ABBREVIATION AS team_abbreviation_in,
        COUNT(*) AS incoming_transfers
      FROM
        Players p1
      JOIN
        Players p2 ON p1.PLAYER_ID = p2.PLAYER_ID AND p1.SEASON = p2.SEASON - 1
      JOIN
        Teams t ON p2.TEAM_ID = t.TEAM_ID
      WHERE
        p1.TEAM_ID <> p2.TEAM_ID
      GROUP BY
        p2.SEASON, p2.TEAM_ID
    ) i
    RIGHT JOIN (
      SELECT
        p1.SEASON AS season,
        p1.TEAM_ID AS team_id,
        t.ABBREVIATION AS team_abbreviation_out,
        COUNT(*) AS outgoing_transfers
      FROM
        Players p1
      JOIN
        Players p2 ON p1.PLAYER_ID = p2.PLAYER_ID AND p1.SEASON = p2.SEASON - 1
      JOIN
        Teams t ON p1.TEAM_ID = t.TEAM_ID
      WHERE
        p1.TEAM_ID <> p2.TEAM_ID
      GROUP BY
        p1.SEASON, p1.TEAM_ID
    ) o ON i.season = o.season AND i.team_id = o.team_id
    ORDER BY
      season, net_transfers DESC
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
};

// Route 13: GET /players/all_stats
const allPlayerStats = async function (req, res) {
  connection.query(`
  WITH games_efficiency AS (
    SELECT PLAYER_ID, PLAYER_NAME,
           (Points + REB + AST + STL + BLK - ((FGA - FGM) + (FTA - FTM) + TurnOver)) AS EFF, Points, REB, AST, TEAM_ID
    FROM Games_details
  ),
  stats AS (
    SELECT PLAYER_ID, PLAYER_NAME, AVG(EFF) AS AVG_EFF, AVG(Points) AS AVG_PTS, AVG(REB) AS AVG_REB, AVG(AST) AS AVG_AST, TEAM_ID 
    FROM games_efficiency
    GROUP BY PLAYER_ID
  ),
  stats2 AS (
    SELECT PLAYER_ID, PLAYER_NAME, AVG_EFF, AVG_PTS, AVG_REB, AVG_AST, TEAM_ID,
    PERCENT_RANK() OVER (ORDER BY AVG_EFF DESC) AS RANKING
    FROM stats
  )
  SELECT PLAYER_ID, PLAYER_NAME, AVG_EFF, AVG_PTS, AVG_REB, AVG_AST, TEAM_ID, RANKING,
  CASE
    WHEN RANKING <= 0.1 THEN 'gold'
    WHEN RANKING <= 0.3 THEN 'silver'
    ELSE 'bronze'
  END AS RARITY
  FROM stats2
  ORDER BY RAND()
  LIMIT 10
  `, (err, data) => {
    if (err || data.length === 0) {
      console.log(err);
      res.json({});
    } else {
      res.json(data);
    }
  });
}

module.exports = {
  playerCard,
  randomTeam,
  playerEfficiency,
  playerRarity,
  highestScorers,
  teamRatings,
  playerStatsRankings,
  playerScores,
  managerScores,
  homecourtAdvantage,
  playerTransfers,
  teamTransfers,
  allPlayerStats,
};

