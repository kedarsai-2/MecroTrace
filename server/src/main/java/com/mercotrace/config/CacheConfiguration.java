package com.mercotrace.config;

import java.net.URI;
import java.util.concurrent.TimeUnit;
import javax.cache.configuration.MutableConfiguration;
import javax.cache.expiry.CreatedExpiryPolicy;
import javax.cache.expiry.Duration;
import org.hibernate.cache.jcache.ConfigSettings;
import org.redisson.Redisson;
import org.redisson.config.ClusterServersConfig;
import org.redisson.config.Config;
import org.redisson.config.SingleServerConfig;
import org.redisson.jcache.configuration.RedissonConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.JCacheManagerCustomizer;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.info.BuildProperties;
import org.springframework.boot.info.GitProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.KeyGenerator;
import com.mercotrace.service.RoleQueryService;
import com.mercotrace.service.dto.WeighingSessionCreateRequest;
import com.mercotrace.service.impl.ChartOfAccountServiceImpl;
import com.mercotrace.service.impl.HighLevelReportsServiceImpl;
import com.mercotrace.service.impl.ReportsServiceImpl;
import com.mercotrace.service.impl.UserRoleServiceImpl;
import org.springframework.context.annotation.*;
import org.springframework.data.domain.Pageable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tech.jhipster.config.JHipsterProperties;
import tech.jhipster.config.cache.PrefixedKeyGenerator;

@Configuration
@EnableCaching
public class CacheConfiguration {

    private GitProperties gitProperties;
    private BuildProperties buildProperties;

    @Bean
    public javax.cache.configuration.Configuration<Object, Object> jcacheConfiguration(JHipsterProperties jHipsterProperties) {
        MutableConfiguration<Object, Object> jcacheConfig = new MutableConfiguration<>();

        URI redisUri = URI.create(jHipsterProperties.getCache().getRedis().getServer()[0]);

        Config config = new Config();
        // Fix Hibernate lazy initialization https://github.com/jhipster/generator-jhipster/issues/22889
        config.setCodec(new org.redisson.codec.SerializationCodec());
        if (jHipsterProperties.getCache().getRedis().isCluster()) {
            ClusterServersConfig clusterServersConfig = config
                .useClusterServers()
                .setMasterConnectionPoolSize(jHipsterProperties.getCache().getRedis().getConnectionPoolSize())
                .setMasterConnectionMinimumIdleSize(jHipsterProperties.getCache().getRedis().getConnectionMinimumIdleSize())
                .setSubscriptionConnectionPoolSize(jHipsterProperties.getCache().getRedis().getSubscriptionConnectionPoolSize())
                .addNodeAddress(jHipsterProperties.getCache().getRedis().getServer());

            if (redisUri.getUserInfo() != null) {
                clusterServersConfig.setPassword(redisUri.getUserInfo().substring(redisUri.getUserInfo().indexOf(':') + 1));
            }
        } else {
            SingleServerConfig singleServerConfig = config
                .useSingleServer()
                .setConnectionPoolSize(jHipsterProperties.getCache().getRedis().getConnectionPoolSize())
                .setConnectionMinimumIdleSize(jHipsterProperties.getCache().getRedis().getConnectionMinimumIdleSize())
                .setSubscriptionConnectionPoolSize(jHipsterProperties.getCache().getRedis().getSubscriptionConnectionPoolSize())
                .setAddress(jHipsterProperties.getCache().getRedis().getServer()[0]);

            if (redisUri.getUserInfo() != null) {
                singleServerConfig.setPassword(redisUri.getUserInfo().substring(redisUri.getUserInfo().indexOf(':') + 1));
            }
        }
        jcacheConfig.setStatisticsEnabled(true);
        jcacheConfig.setExpiryPolicyFactory(
            CreatedExpiryPolicy.factoryOf(new Duration(TimeUnit.SECONDS, jHipsterProperties.getCache().getRedis().getExpiration()))
        );
        return RedissonConfiguration.fromInstance(Redisson.create(config), jcacheConfig);
    }

    @Bean
    public HibernatePropertiesCustomizer hibernatePropertiesCustomizer(javax.cache.CacheManager cm) {
        return hibernateProperties -> hibernateProperties.put(ConfigSettings.CACHE_MANAGER, cm);
    }

    @Bean
    public JCacheManagerCustomizer cacheManagerCustomizer(javax.cache.configuration.Configuration<Object, Object> jcacheConfiguration) {
        return cm -> {
            createCache(cm, com.mercotrace.repository.UserRepository.USERS_BY_LOGIN_CACHE, jcacheConfiguration);
            createCache(cm, com.mercotrace.repository.UserRepository.USERS_BY_EMAIL_CACHE, jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.User.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Authority.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.User.class.getName() + ".authorities", jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Trader.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.UserTrader.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.OtpToken.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Role.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Role.class.getName() + ".permissions", jcacheConfiguration);
            // Settings / RBAC: Role & UserRole caches
            createCache(cm, RoleQueryService.CACHE_ROLES_BY_CRITERIA_PAGE, jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.UserRole.class.getName(), jcacheConfiguration);
            createCache(cm, UserRoleServiceImpl.CACHE_USER_ROLES_PAGE, jcacheConfiguration);
            createCache(cm, UserRoleServiceImpl.CACHE_USER_ROLES_BY_USER, jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Permission.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Permission.class.getName() + ".roles", jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.BusinessCategory.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Contact.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Commodity.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.CommodityConfig.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.DeductionRule.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.HamaliSlab.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.DynamicCharge.class.getName(), jcacheConfiguration);
            // Arrivals & logistics aggregate
            createCache(cm, com.mercotrace.domain.Vehicle.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.VehicleWeight.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.SellerInVehicle.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Lot.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.FreightCalculation.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.FreightDistribution.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.Voucher.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.DailySerial.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.DailySerialAllocation.class.getName(), jcacheConfiguration);
            // Accounting: Chart of Accounts
            createCache(cm, com.mercotrace.domain.ChartOfAccount.class.getName(), jcacheConfiguration);
            createCache(cm, ChartOfAccountServiceImpl.CACHE_COA_BY_ID, jcacheConfiguration);
            createCache(cm, ChartOfAccountServiceImpl.CACHE_COA_PAGE_BY_TRADER, jcacheConfiguration);
            // Auction module (Sales Pad)
            createCache(cm, com.mercotrace.domain.AuctionEntry.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.PresetMarkSetting.class.getName(), jcacheConfiguration);
            // Print format presets (Settlement / Billing) per trader
            createCache(cm, com.mercotrace.domain.PrintSetting.class.getName(), jcacheConfiguration);
            // Platform-wide auction presets for traders with preset_enabled=false
            createCache(cm, com.mercotrace.domain.GlobalPresetMarkSetting.class.getName(), jcacheConfiguration);
            // Weighing: entity L2 cache + by-bid lookup (TTL from Redis config)
            createCache(cm, com.mercotrace.domain.WeighingSession.class.getName(), jcacheConfiguration);
            createCache(cm, "weighingSessionByBid", jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.PrintLog.class.getName(), jcacheConfiguration);
            // Writer's Pad: session + weight entries (operational log, no method-level caches)
            createCache(cm, com.mercotrace.domain.WriterPadSession.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.WriterPadWeightEntry.class.getName(), jcacheConfiguration);
            // Self-Sale module
            createCache(cm, com.mercotrace.domain.SelfSaleClosure.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.AuctionSelfSaleUnit.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.StockPurchase.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.StockPurchaseItem.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.StockPurchaseCharge.class.getName(), jcacheConfiguration);
            // Stock Purchase: vendor list by trader (read-heavy; evicted on contact save/update/delete)
            createCache(cm, com.mercotrace.service.impl.ContactServiceImpl.STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE, jcacheConfiguration);
            // CDN module: entity L2 + paginated list by trader (evicted on create/receive)
            createCache(cm, com.mercotrace.domain.Cdn.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.CdnItem.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.CdnTransfer.class.getName(), jcacheConfiguration);
            createCache(cm, "cdnListByTrader", jcacheConfiguration);
            // Settlement (Sales Patti)
            createCache(cm, com.mercotrace.domain.Patti.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.PattiRateCluster.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.PattiDeduction.class.getName(), jcacheConfiguration);
            // Sales Bill (Billing)
            createCache(cm, com.mercotrace.domain.SalesBill.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.SalesBillCommodityGroup.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.SalesBillLineItem.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.SalesBillVersion.class.getName(), jcacheConfiguration);
            // Vouchers & Payments (accounting voucher header + lines)
            createCache(cm, com.mercotrace.domain.VoucherHeader.class.getName(), jcacheConfiguration);
            createCache(cm, com.mercotrace.domain.VoucherLine.class.getName(), jcacheConfiguration);
            // Financial Reports / AR-AP aging
            createCache(cm, com.mercotrace.domain.ArApDocument.class.getName(), jcacheConfiguration);
            createCache(cm, ReportsServiceImpl.CACHE_TRIAL_BALANCE_BY_TRADER_AND_DATE_RANGE, jcacheConfiguration);
            createCache(cm, ReportsServiceImpl.CACHE_PL_BY_TRADER, jcacheConfiguration);
            createCache(cm, ReportsServiceImpl.CACHE_BALANCE_SHEET_BY_TRADER, jcacheConfiguration);
            createCache(cm, ReportsServiceImpl.CACHE_AGING_BY_TRADER_AND_TYPE, jcacheConfiguration);
            createCache(cm, ReportsServiceImpl.CACHE_COMMODITY_PROFIT_BY_TRADER_AND_DATE_RANGE, jcacheConfiguration);
        createCache(cm, HighLevelReportsServiceImpl.CACHE_PARTY_EXPOSURE_BY_TRADER_AND_DATE_RANGE, jcacheConfiguration);
        createCache(cm, HighLevelReportsServiceImpl.CACHE_ADMIN_DAILY_SUMMARY_BY_TRADER_AND_DATE_RANGE, jcacheConfiguration);
            // jhipster-needle-redis-add-entry
        };
    }

    private void createCache(
        javax.cache.CacheManager cm,
        String cacheName,
        javax.cache.configuration.Configuration<Object, Object> jcacheConfiguration
    ) {
        javax.cache.Cache<Object, Object> cache = cm.getCache(cacheName);
        if (cache != null) {
            cache.clear();
        } else {
            cm.createCache(cacheName, jcacheConfiguration);
        }
    }

    @Autowired(required = false)
    public void setGitProperties(GitProperties gitProperties) {
        this.gitProperties = gitProperties;
    }

    @Autowired(required = false)
    public void setBuildProperties(BuildProperties buildProperties) {
        this.buildProperties = buildProperties;
    }

    @Bean
    public KeyGenerator keyGenerator() {
        return new PrefixedKeyGenerator(this.gitProperties, this.buildProperties);
    }

    /**
     * Key generator for weighingSessionByBid cache: key = "traderId::bidNumber".
     * Used by getByBidNumber (param: Integer) and by cache eviction on create (param: WeighingSessionCreateRequest).
     */
    @Bean(name = "weighingByBidKeyGenerator")
    public KeyGenerator weighingByBidKeyGenerator() {
        return (target, method, params) -> {
            Integer bidNumber = null;
            if (params.length > 0) {
                if (params[0] instanceof Integer) {
                    bidNumber = (Integer) params[0];
                } else if (params[0] instanceof WeighingSessionCreateRequest) {
                    bidNumber = ((WeighingSessionCreateRequest) params[0]).getBidNumber();
                }
            }
            return (bidNumber != null) ? ("bid::" + bidNumber) : "bid::";
        };
    }

    /**
     * Key generator for cdnListByTrader cache: key = "traderId::page::size::sort::search".
     * Eviction uses allEntries = true on create/receive.
     */
    @Bean(name = "cdnListByTraderKeyGenerator")
    public KeyGenerator cdnListByTraderKeyGenerator() {
        return (target, method, params) -> {
            int page = 0, size = 10;
            String sort = "";
            String search = "";
            if (params != null && params.length >= 1 && params[0] instanceof Pageable p) {
                page = p.getPageNumber();
                size = p.getPageSize();
                sort = p.getSort().isSorted() ? p.getSort().toString() : "";
            }
            if (params != null && params.length >= 2 && params[1] != null) {
                search = params[1].toString().trim();
            }
            return page + "::" + size + "::" + sort + "::" + search;
        };
    }

    /**
     * Key generator for chartOfAccounts page cache:
     * key = "traderId::page::size::sort::search::accountingClass::classification".
     */
    @Bean(name = "chartOfAccountsPageKeyGenerator")
    public KeyGenerator chartOfAccountsPageKeyGenerator() {
        return (target, method, params) -> {
            int page = 0, size = 10;
            String sort = "";
            String search = "";
            String accountingClass = "";
            String classification = "";
            if (params != null && params.length >= 1 && params[0] instanceof Pageable p) {
                page = p.getPageNumber();
                size = p.getPageSize();
                sort = p.getSort().isSorted() ? p.getSort().toString() : "";
            }
            if (params != null && params.length >= 2 && params[1] != null) {
                search = params[1].toString().trim();
            }
            if (params != null && params.length >= 3 && params[2] != null) {
                accountingClass = params[2].toString().trim();
            }
            if (params != null && params.length >= 4 && params[3] != null) {
                classification = params[3].toString().trim();
            }
            return page + "::" + size + "::" + sort + "::" + search + "::" + accountingClass + "::" + classification;
        };
    }

    /**
     * Key generator for reports caches:
     * key = "methodName[::param1::param2::…]".
     * Ensures analytics caches are parameter-sensitive.
     */
    @Bean(name = "reportsKeyGenerator")
    public KeyGenerator reportsKeyGenerator() {
        return (target, method, params) -> {
            StringBuilder key = new StringBuilder();
            key.append(method.getName());
            if (params != null) {
                for (Object param : params) {
                    key.append("::");
                    key.append(param != null ? param.toString().trim() : "null");
                }
            }
            return key.toString();
        };
    }
}
