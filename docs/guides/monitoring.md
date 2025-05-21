---
title: Monitoring Guide
description: Monitoring and alerting for nsyte sites
---

# Monitoring Guide

This guide covers how to monitor your nsyte sites and set up effective alerting.

## Monitoring Overview

### What to Monitor

1. **Site Health**
   - Site availability
   - Response times
   - Error rates
   - Resource usage

2. **Relay Performance**
   - Connection status
   - Message latency
   - Error rates
   - Queue lengths

3. **Authentication**
   - Login attempts
   - Key usage
   - Permission changes
   - Session activity

4. **Content Delivery**
   - File access patterns
   - Cache hit rates
   - Bandwidth usage
   - Storage metrics

## Setting Up Monitoring

### Basic Monitoring

1. **Health Checks**
   ```bash
   # Check site health
   nsyte health check
   
   # Monitor relay status
   nsyte relay status
   
   # View site metrics
   nsyte metrics show
   ```

2. **Logging**
   ```bash
   # View access logs
   nsyte logs access
   
   # View error logs
   nsyte logs error
   
   # View audit logs
   nsyte logs audit
   ```

### Advanced Monitoring

1. **Custom Metrics**
   ```yaml
   monitoring:
     metrics:
       - name: site_uptime
         type: gauge
         description: "Site uptime percentage"
         
       - name: relay_latency
         type: histogram
         description: "Relay message latency"
         
       - name: auth_attempts
         type: counter
         description: "Authentication attempts"
   ```

2. **Log Aggregation**
   ```yaml
   logging:
     aggregator:
       type: elasticsearch
       url: https://logs.example.com
       index: nsyte-logs
       
     retention:
       access: 30d
       error: 90d
       audit: 365d
   ```

## Alerting

### Alert Configuration

1. **Basic Alerts**
   ```yaml
   alerts:
     - name: site_down
       condition: uptime < 99.9
       period: 5m
       severity: critical
       
     - name: high_latency
       condition: relay_latency > 1000
       period: 1m
       severity: warning
       
     - name: auth_failures
       condition: auth_failures > 5
       period: 5m
       severity: warning
   ```

2. **Advanced Alerts**
   ```yaml
   alerts:
     - name: site_degradation
       condition: |
         rate(errors_total[5m]) / rate(requests_total[5m]) > 0.01
       period: 5m
       severity: warning
       annotations:
         summary: "High error rate detected"
         description: "Error rate is above 1% for the last 5 minutes"
         
     - name: relay_issues
       condition: |
         max(relay_status) == 0
       period: 1m
       severity: critical
       annotations:
         summary: "Relay connection lost"
         description: "Primary relay is not responding"
   ```

### Notification Channels

1. **Email**
   ```yaml
   notifications:
     email:
       smtp:
         host: smtp.example.com
         port: 587
         username: alerts@example.com
         password: ${SMTP_PASSWORD}
       recipients:
         - ops@example.com
         - oncall@example.com
   ```

2. **Slack**
   ```yaml
   notifications:
     slack:
       webhook: ${SLACK_WEBHOOK}
       channel: "#nsyte-alerts"
       username: "nsyte-monitor"
   ```

3. **Nostr**
   ```yaml
   notifications:
     nostr:
       relay: wss://relay.example.com
       pubkey: ${NOSTR_PUBKEY}
       kind: 1
   ```

## Dashboards

### Basic Dashboard

1. **Site Overview**
   - Uptime
   - Response times
   - Error rates
   - Active users

2. **Relay Status**
   - Connection health
   - Message rates
   - Latency
   - Queue status

3. **Authentication**
   - Login attempts
   - Success rate
   - Key usage
   - Session stats

### Advanced Dashboard

1. **Performance**
   ```yaml
   dashboards:
     performance:
       panels:
         - title: "Response Time Distribution"
           type: histogram
           query: rate(response_time_bucket[5m])
           
         - title: "Error Rate Trend"
           type: graph
           query: rate(errors_total[5m]) / rate(requests_total[5m])
           
         - title: "Cache Hit Ratio"
           type: gauge
           query: rate(cache_hits_total[5m]) / rate(cache_requests_total[5m])
   ```

2. **Security**
   ```yaml
   dashboards:
     security:
       panels:
         - title: "Authentication Attempts"
           type: graph
           query: rate(auth_attempts_total[5m])
           
         - title: "Failed Logins"
           type: graph
           query: rate(auth_failures_total[5m])
           
         - title: "Active Sessions"
           type: gauge
           query: active_sessions
   ```

## Best Practices

### Monitoring

1. **Coverage**
   - Monitor all critical paths
   - Include business metrics
   - Track user experience
   - Monitor dependencies

2. **Performance**
   - Use efficient queries
   - Aggregate when possible
   - Set appropriate intervals
   - Optimize storage

3. **Reliability**
   - Redundant monitoring
   - Failover systems
   - Data backup
   - Regular testing

### Alerting

1. **Alert Design**
   - Clear conditions
   - Meaningful thresholds
   - Actionable alerts
   - Proper severity

2. **Noise Reduction**
   - Group related alerts
   - Use time windows
   - Implement hysteresis
   - Filter false positives

3. **Response**
   - Clear procedures
   - Escalation paths
   - Runbook integration
   - Regular review

## Troubleshooting

### Common Issues

1. **High Alert Volume**
   - Review thresholds
   - Adjust time windows
   - Group related alerts
   - Filter noise

2. **Missing Data**
   - Check collectors
   - Verify connectivity
   - Review retention
   - Check permissions

3. **False Positives**
   - Adjust conditions
   - Add context
   - Review patterns
   - Update thresholds

### Getting Help

- Check the [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- Review the [Security Guide](./security.md)
- Join the [Nostr channel](https://njump.me/npub1...)
- Contact support

## Next Steps

- Set up [incident response](./incident-response.md)
- Review [security monitoring](./security.md#monitoring-and-alerts)
- Learn about [deployment monitoring](./deployment.md#monitoring)
- Implement [custom metrics](./custom-metrics.md) 