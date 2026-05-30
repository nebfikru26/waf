using ClickHouse.Client.ADO;
using Microsoft.Extensions.Configuration;
using System;
using System.Threading.Tasks;

namespace AffiniSecurity.Waf.Services
{
    public interface IClickHouseService
    {
        Task InitializeAsync();
        Task InsertTrafficLogAsync(string tenantId, string time, int requests = 1, int blocked = 0);
        Task<long> GetTotalRequestsAsync();
    }

    public class ClickHouseService : IClickHouseService
    {
        private readonly string _connectionString;

        public ClickHouseService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("ClickHouseConnection") ?? "Host=localhost;Port=8123;Username=default;Password=";
        }

        public async Task InitializeAsync()
        {
            using var connection = new ClickHouseConnection(_connectionString);
            await connection.OpenAsync();

            var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE IF NOT EXISTS network_metadata (
                    TenantId String,
                    Time String,
                    Requests Int32,
                    Blocked Int32,
                    CreatedAt DateTime
                ) ENGINE = MergeTree()
                ORDER BY (TenantId, Time)
                TTL CreatedAt + INTERVAL 1 YEAR;
            ";
            await command.ExecuteNonQueryAsync();
        }

        public async Task InsertTrafficLogAsync(string tenantId, string time, int requests = 1, int blocked = 0)
        {
            try 
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                command.CommandText = @"
                    INSERT INTO network_metadata (TenantId, Time, Requests, Blocked, CreatedAt)
                    VALUES ({tenantId:String}, {time:String}, {requests:Int32}, {blocked:Int32}, {createdAt:DateTime})
                ";
                
                command.AddParameter("tenantId", string.IsNullOrEmpty(tenantId) ? "global" : tenantId);
                command.AddParameter("time", time);
                command.AddParameter("requests", requests);
                command.AddParameter("blocked", blocked);
                command.AddParameter("createdAt", DateTime.UtcNow);

                await command.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClickHouse] Error inserting traffic log: {ex.Message}");
            }
        }

        public async Task<long> GetTotalRequestsAsync()
        {
            try 
            {
                using var connection = new ClickHouseConnection(_connectionString);
                await connection.OpenAsync();

                var command = connection.CreateCommand();
                command.CommandText = "SELECT sum(Requests) FROM network_metadata";
                var result = await command.ExecuteScalarAsync();
                
                if (result != DBNull.Value && result != null)
                {
                    return Convert.ToInt64(result);
                }
                return 0;
            }
            catch 
            {
                return 0;
            }
        }
    }
}
